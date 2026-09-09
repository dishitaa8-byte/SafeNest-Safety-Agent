import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  appliancesTable,
  auditEventsTable,
  incidentReportsTable,
  maintenanceRecordsTable,
  maintenanceTicketsTable,
  sensorReadingsTable,
  db,
} from "@workspace/db";

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

const asNumber = (value: string | number | null): number =>
  value == null ? 0 : Number(value);

export const riskLevelForScore = (score: number): RiskLevel => {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
};

export async function findAppliance(assetCode: string) {
  const [appliance] = await db
    .select()
    .from(appliancesTable)
    .where(eq(appliancesTable.assetCode, assetCode));
  return appliance;
}

export async function serializeAppliance(
  appliance: NonNullable<Awaited<ReturnType<typeof findAppliance>>>,
) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(incidentReportsTable)
    .where(
      and(
        eq(incidentReportsTable.applianceId, appliance.id),
        or(
          eq(incidentReportsTable.status, "OPEN"),
          eq(incidentReportsTable.status, "REVIEWED"),
        ),
      ),
    );

  return {
    id: appliance.id,
    asset_code: appliance.assetCode,
    name: appliance.name,
    category: appliance.category,
    location: appliance.location,
    age_years: asNumber(appliance.ageYears),
    status: appliance.status,
    risk_level: appliance.riskLevel as RiskLevel,
    risk_score: appliance.riskScore,
    last_assessed_at: appliance.lastAssessedAt.toISOString(),
    open_incidents: Number(count),
  };
}

export async function getSensorData(applianceId: number) {
  const readings = await db
    .select()
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.applianceId, applianceId))
    .orderBy(sensorReadingsTable.timestamp);

  const serialized = readings.map((reading) => ({
    timestamp: reading.timestamp.toISOString(),
    temperature_c: asNumber(reading.temperatureC),
    current_amps: asNumber(reading.currentAmps),
    voltage: asNumber(reading.voltage),
    power_watts: asNumber(reading.powerWatts),
    speed_rpm: asNumber(reading.speedRpm),
    vibration_level: asNumber(reading.vibrationLevel),
    mcb_trip_detected: reading.mcbTripDetected,
    burning_smell_reported: reading.burningSmellReported,
  }));

  const latest = serialized.at(-1);
  const baseline = {
    temperature_c: 40,
    current_amps: 0.9,
    voltage: 230,
    speed_rpm: 1350,
  };
  const anomalies: string[] = [];
  if (latest) {
    if (latest.temperature_c > 55)
      anomalies.push("Temperature is above the expected operating range");
    if (latest.current_amps > 1.3)
      anomalies.push("Current draw is higher than the facility baseline");
    if (latest.speed_rpm < 1000)
      anomalies.push("Operating speed has dropped below the expected range");
    if (serialized.some((reading) => reading.mcb_trip_detected))
      anomalies.push("An MCB trip was recorded in the recent reading window");
    if (serialized.some((reading) => reading.burning_smell_reported))
      anomalies.push("A burning smell was reported alongside sensor data");
  }

  return { readings: serialized, baseline, anomalies };
}

export async function calculateRisk(applianceId: number) {
  const sensorData = await getSensorData(applianceId);
  const maintenance = await db
    .select()
    .from(maintenanceRecordsTable)
    .where(eq(maintenanceRecordsTable.applianceId, applianceId))
    .orderBy(desc(maintenanceRecordsTable.date));
  const incidents = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.applianceId, applianceId))
    .orderBy(desc(incidentReportsTable.createdAt));
  const [appliance] = await db
    .select()
    .from(appliancesTable)
    .where(eq(appliancesTable.id, applianceId));

  const latest = sensorData.readings.at(-1);
  let score = 0;
  const triggeredRules: string[] = [];
  if (latest && latest.temperature_c > 55) {
    score += latest.temperature_c > 70 ? 30 : 15;
    triggeredRules.push(
      latest.temperature_c > 70
        ? "Severely elevated temperature"
        : "Elevated temperature",
    );
  }
  if (latest && latest.current_amps > 1.3) {
    score += 15;
    triggeredRules.push("High current draw");
  }
  if (latest && latest.speed_rpm < 1000) {
    score += 15;
    triggeredRules.push("Declining operating speed");
  }
  if (sensorData.readings.some((reading) => reading.mcb_trip_detected)) {
    score += 25;
    triggeredRules.push("MCB trip detected");
  }
  if (sensorData.readings.some((reading) => reading.burning_smell_reported)) {
    score += 35;
    triggeredRules.push("Burning smell reported");
  }
  if (incidents.filter((incident) => incident.status !== "RESOLVED").length > 1) {
    score += 15;
    triggeredRules.push("Multiple unresolved incident reports");
  }
  if (asNumber(appliance.ageYears) >= 5) {
    score += 10;
    triggeredRules.push("Appliance is past the five-year service marker");
  }
  const hasSmell = sensorData.readings.some(
    (reading) => reading.burning_smell_reported,
  );
  const hasElectricalAnomaly =
    sensorData.readings.some((reading) => reading.mcb_trip_detected) ||
    Boolean(latest && latest.current_amps > 1.3);
  if (hasSmell && hasElectricalAnomaly) score = Math.max(score, 75);

  return {
    score: Math.min(score, 100),
    level: riskLevelForScore(score),
    triggeredRules,
    sensorData,
    maintenance,
    incidents,
  };
}

export async function buildInvestigation(assetCode: string) {
  const appliance = await findAppliance(assetCode);
  if (!appliance) return undefined;

  const risk = await calculateRisk(appliance.id);
  const serializedAppliance = await serializeAppliance(appliance);
  const evidence = risk.triggeredRules.map((rule) => {
    const source = rule.includes("incident") || rule.includes("smell")
      ? "Human reports"
      : rule.includes("maintenance") || rule.includes("service")
        ? "Maintenance history"
        : "Sensor telemetry";
    return {
      source,
      text: rule,
      severity:
        risk.level === "CRITICAL" || risk.level === "HIGH" ? "urgent" : "watch",
    };
  });

  const recommendedActions =
    risk.level === "CRITICAL"
      ? [
          "Stop using the appliance until a qualified technician inspects it",
          "Open a high-priority maintenance ticket for human approval",
          "Evaluate replacement rather than another repair",
        ]
      : risk.level === "HIGH"
        ? [
            "Schedule a qualified technician inspection",
            "Review recent maintenance and incident history",
            "Keep the appliance under observation until resolved",
          ]
        : risk.level === "MEDIUM"
          ? [
              "Schedule a preventive inspection",
              "Continue monitoring the next reading window",
            ]
          : ["Continue routine monitoring"];

  return {
    appliance: { ...serializedAppliance, risk_level: risk.level, risk_score: risk.score },
    risk_level: risk.level,
    risk_score: risk.score,
    summary:
      risk.level === "CRITICAL"
        ? `${assetCode} has multiple independent warning signals that need human intervention before continued use.`
        : `${assetCode} is currently classified as ${risk.level.toLowerCase()} based on its recent evidence.`,
    evidence,
    recommended_actions: recommendedActions,
    requires_human_approval: risk.level !== "LOW",
    limitations: [
      "This is a risk-prioritization assessment from simulated telemetry and human reports.",
      "It is not a guarantee that an incident will or will not occur.",
    ],
  };
}

export async function refreshRisk(applianceId: number) {
  const risk = await calculateRisk(applianceId);
  await db
    .update(appliancesTable)
    .set({
      riskLevel: risk.level,
      riskScore: risk.score,
      lastAssessedAt: new Date(),
    })
    .where(eq(appliancesTable.id, applianceId));
  return risk;
}

export async function writeAuditEvent(
  eventType: string,
  actor: string,
  payload: unknown,
  applianceId?: number,
) {
  await db.insert(auditEventsTable).values({
    eventType,
    actor,
    applianceId,
    payloadJson: JSON.stringify(payload),
  });
}

export async function ensureSeedData() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appliancesTable);
  if (Number(count) > 0) return;

  const now = Date.now();
  const applianceSeeds = [
    {
      assetCode: "Fan-104",
      name: "Ceiling Fan",
      category: "Ventilation",
      location: "Hostel A · Room 104",
      ageYears: "6.2",
      riskLevel: "CRITICAL",
      riskScore: 100,
    },
    {
      assetCode: "Heater-208",
      name: "Water Heater",
      category: "Heating",
      location: "Hostel B · Utility Room",
      ageYears: "4.8",
      riskLevel: "HIGH",
      riskScore: 58,
    },
    {
      assetCode: "Fridge-012",
      name: "Commercial Refrigerator",
      category: "Cooling",
      location: "Main Kitchen",
      ageYears: "2.1",
      riskLevel: "MEDIUM",
      riskScore: 34,
    },
    {
      assetCode: "Pump-033",
      name: "Circulation Pump",
      category: "Plumbing",
      location: "Basement Plant",
      ageYears: "1.4",
      riskLevel: "LOW",
      riskScore: 12,
    },
    {
      assetCode: "Microwave-007",
      name: "Staff Kitchen Microwave",
      category: "Kitchen",
      location: "Admin Block · Pantry",
      ageYears: "0.9",
      riskLevel: "LOW",
      riskScore: 4,
    },
    {
      assetCode: "AC-119",
      name: "Split Air Conditioner",
      category: "Climate",
      location: "Hostel A · Common Room",
      ageYears: "3.7",
      riskLevel: "MEDIUM",
      riskScore: 28,
    },
  ] as const;

  const appliances = await db
    .insert(appliancesTable)
    .values(
      applianceSeeds.map((seed) => ({
        assetCode: seed.assetCode,
        name: seed.name,
        category: seed.category,
        location: seed.location,
        installDate: new Date(now - Number(seed.ageYears) * 365 * 86400000),
        ageYears: seed.ageYears,
        status: "ACTIVE",
        riskLevel: seed.riskLevel,
        riskScore: seed.riskScore,
        lastAssessedAt: new Date(),
      })),
    )
    .returning();

  const applianceByCode = new Map(
    appliances.map((appliance) => [appliance.assetCode, appliance]),
  );
  const normal = [
    { temp: 38, current: 0.82, voltage: 231, power: 190, speed: 1380, vibration: 0.12 },
    { temp: 40, current: 0.86, voltage: 230, power: 198, speed: 1360, vibration: 0.14 },
    { temp: 41, current: 0.88, voltage: 229, power: 203, speed: 1345, vibration: 0.16 },
    { temp: 42, current: 0.9, voltage: 230, power: 207, speed: 1330, vibration: 0.18 },
  ];
  const readingsToInsert = appliances.flatMap((appliance) => {
    const isFan = appliance.assetCode === "Fan-104";
    const isHeater = appliance.assetCode === "Heater-208";
    const isAc = appliance.assetCode === "AC-119";
    return Array.from({ length: 12 }, (_, index) => {
      const hoursAgo = 12 - index;
      const healthy = normal[index % normal.length];
      const progress = index / 11;
      return {
        applianceId: appliance.id,
        timestamp: new Date(now - hoursAgo * 3600000),
        temperatureC: String(
          isFan ? Math.round(46 + progress * 38) : isHeater ? 48 + progress * 12 : isAc ? 44 + progress * 5 : healthy.temp,
        ),
        currentAmps: String(
          isFan ? (0.9 + progress * 0.8).toFixed(2) : isHeater ? (1.05 + progress * 0.3).toFixed(2) : healthy.current.toFixed(2),
        ),
        voltage: String(isFan && index > 8 ? 224 : healthy.voltage),
        powerWatts: String(
          isFan ? Math.round(205 + progress * 130) : isHeater ? Math.round(850 + progress * 80) : healthy.power,
        ),
        speedRpm: String(isFan ? Math.round(1380 - progress * 760) : healthy.speed),
        vibrationLevel: String(isFan ? (0.18 + progress * 0.5).toFixed(2) : healthy.vibration.toFixed(2)),
        mcbTripDetected: isFan && (index === 8 || index === 11),
        burningSmellReported: isFan && index >= 10,
      };
    });
  });
  await db.insert(sensorReadingsTable).values(readingsToInsert);

  const fan = applianceByCode.get("Fan-104");
  const heater = applianceByCode.get("Heater-208");
  const fridge = applianceByCode.get("Fridge-012");
  if (!fan || !heater || !fridge) return;

  await db.insert(maintenanceRecordsTable).values([
    {
      applianceId: fan.id,
      date: new Date(now - 42 * 86400000),
      maintenanceType: "Repair",
      description: "Motor capacitor replaced after intermittent slow running. Issue returned.",
      cost: "38",
      technician: "R. Patel",
      outcome: "Recurring",
    },
    {
      applianceId: fan.id,
      date: new Date(now - 190 * 86400000),
      maintenanceType: "Inspection",
      description: "Bearing noise observed; recommended replacement at next budget review.",
      cost: "12",
      technician: "M. Shah",
      outcome: "Unresolved",
    },
    {
      applianceId: heater.id,
      date: new Date(now - 75 * 86400000),
      maintenanceType: "Inspection",
      description: "Thermostat response slightly delayed; monitor temperature.",
      cost: "10",
      technician: "R. Patel",
      outcome: "Monitoring",
    },
    {
      applianceId: fridge.id,
      date: new Date(now - 28 * 86400000),
      maintenanceType: "Cleaning",
      description: "Coils cleaned and door seal checked.",
      cost: "24",
      technician: "Facilities team",
      outcome: "Resolved",
    },
  ]);

  await db.insert(incidentReportsTable).values([
    {
      applianceId: fan.id,
      reportedBy: "Night supervisor",
      createdAt: new Date(now - 2 * 86400000),
      description: "Fan is running much slower than usual and making a dry bearing noise.",
      severity: "CONCERNING",
      status: "OPEN",
    },
    {
      applianceId: fan.id,
      reportedBy: "Room 104 resident",
      createdAt: new Date(now - 1 * 86400000),
      description: "Burning smell noticed near the fan plug after the MCB tripped.",
      severity: "URGENT",
      status: "OPEN",
    },
    {
      applianceId: heater.id,
      reportedBy: "Maintenance desk",
      createdAt: new Date(now - 5 * 86400000),
      description: "Heater cycles longer than expected during morning peak.",
      severity: "CONCERNING",
      status: "REVIEWED",
    },
    {
      applianceId: fridge.id,
      reportedBy: "Kitchen lead",
      createdAt: new Date(now - 12 * 86400000),
      description: "Temperature briefly rose during a busy service period.",
      severity: "INFORMATIONAL",
      status: "RESOLVED",
    },
  ]);

  await db.insert(maintenanceTicketsTable).values({
    applianceId: fan.id,
    title: "Inspect or replace Fan-104",
    description:
      "Critical risk from elevated temperature, declining speed, MCB trips, burning smell, and recurring motor issues. Human approval is required before work is initiated.",
    priority: "CRITICAL",
    recommendedAction: "Inspect and evaluate replacement",
    status: "AWAITING_APPROVAL",
    createdBy: "SafeNest agent",
  });
}

export async function listAppliances(filters: {
  riskLevel?: string;
  search?: string;
  location?: string;
}) {
  const conditions = [];
  if (filters.riskLevel)
    conditions.push(eq(appliancesTable.riskLevel, filters.riskLevel));
  if (filters.search) {
    conditions.push(
      or(
        ilike(appliancesTable.assetCode, `%${filters.search}%`),
        ilike(appliancesTable.name, `%${filters.search}%`),
      ),
    );
  }
  if (filters.location)
    conditions.push(ilike(appliancesTable.location, `%${filters.location}%`));
  const rows = await db
    .select()
    .from(appliancesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(appliancesTable.riskScore));
  return Promise.all(rows.map(serializeAppliance));
}