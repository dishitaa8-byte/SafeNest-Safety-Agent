import { Router, type IRouter } from "express";
import {
  ApproveTicketBody,
  ApproveTicketParams,
  ApproveTicketResponse,
  CreateIncidentBody,
  CreateIncidentResponse,
  CreateTicketBody,
  CreateTicketResponse,
  GetApplianceIncidentsParams,
  GetApplianceIncidentsResponse,
  GetApplianceMaintenanceParams,
  GetApplianceMaintenanceResponse,
  GetApplianceParams,
  GetApplianceResponse,
  GetApplianceSensorsParams,
  GetApplianceSensorsResponse,
  GetDashboardSummaryResponse,
  IncidentReport as IncidentReportSchema,
  InvestigateApplianceParams,
  InvestigateApplianceResponse,
  ListAppliancesQueryParams,
  ListAppliancesResponse,
  ListIncidentsQueryParams,
  ListIncidentsResponse,
  ListTicketsQueryParams,
  ListTicketsResponse,
  RejectTicketBody,
  RejectTicketParams,
  RejectTicketResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import {
  appliancesTable,
  db,
  incidentReportsTable,
  maintenanceRecordsTable,
  maintenanceTicketsTable,
} from "@workspace/db";
import {
  buildInvestigation,
  calculateRisk,
  findAppliance,
  listAppliances,
  refreshRisk,
  serializeAppliance,
  getSensorData,
  writeAuditEvent,
} from "../lib/safenest";
import { refineAssistantAnswer, refineInvestigationSummary } from "../lib/llm";

const router: IRouter = Router();

const dateString = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

const serializeIncident = (incident: typeof incidentReportsTable.$inferSelect, assetCode: string) => ({
  id: incident.id,
  appliance_asset_code: assetCode,
  reported_by: incident.reportedBy,
  created_at: dateString(incident.createdAt),
  description: incident.description,
  severity: incident.severity,
  status: incident.status,
});

const serializeMaintenance = (
  record: typeof maintenanceRecordsTable.$inferSelect,
) => ({
  id: record.id,
  date: dateString(record.date),
  maintenance_type: record.maintenanceType,
  description: record.description,
  cost: record.cost == null ? null : Number(record.cost),
  technician: record.technician,
  outcome: record.outcome,
});

const serializeTicket = (
  ticket: typeof maintenanceTicketsTable.$inferSelect,
  assetCode: string,
) => ({
  id: ticket.id,
  appliance_asset_code: assetCode,
  title: ticket.title,
  description: ticket.description,
  priority: ticket.priority,
  recommended_action: ticket.recommendedAction,
  status: ticket.status,
  created_by: ticket.createdBy,
  approved_by: ticket.approvedBy,
  created_at: dateString(ticket.createdAt),
  approved_at: dateString(ticket.approvedAt),
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const appliances = await listAppliances({});
  const incidents = await db
    .select()
    .from(incidentReportsTable)
    .orderBy(desc(incidentReportsTable.createdAt))
    .limit(5);
  const incidentWithAssets = await Promise.all(
    incidents.map(async (incident) => {
      const appliance = await db
        .select({ assetCode: appliancesTable.assetCode })
        .from(appliancesTable)
        .where(eq(appliancesTable.id, incident.applianceId));
      return serializeIncident(incident, appliance[0]?.assetCode ?? "Unknown");
    }),
  );
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)` })
    .from(maintenanceTicketsTable)
    .where(eq(maintenanceTicketsTable.status, "AWAITING_APPROVAL"));
  const response = {
    total_appliances: appliances.length,
    counts_by_risk: {
      LOW: appliances.filter((item) => item.risk_level === "LOW").length,
      MEDIUM: appliances.filter((item) => item.risk_level === "MEDIUM").length,
      HIGH: appliances.filter((item) => item.risk_level === "HIGH").length,
      CRITICAL: appliances.filter((item) => item.risk_level === "CRITICAL").length,
    },
    critical_appliances: appliances.filter(
      (item) => item.risk_level === "CRITICAL" || item.risk_level === "HIGH",
    ),
    pending_approvals: Number(pending),
    recent_incidents: incidentWithAssets,
  };
  res.json(GetDashboardSummaryResponse.parse(response));
});

router.get("/appliances", async (req, res): Promise<void> => {
  const parsed = ListAppliancesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = await listAppliances({
    riskLevel: parsed.data.risk_level,
    search: parsed.data.search,
    location: parsed.data.location,
  });
  res.json(ListAppliancesResponse.parse(data));
});

router.get("/appliances/:assetCode", async (req, res): Promise<void> => {
  const parsed = GetApplianceParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const appliance = await findAppliance(parsed.data.assetCode);
  if (!appliance) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }
  res.json(GetApplianceResponse.parse(await serializeAppliance(appliance)));
});

router.get(
  "/appliances/:assetCode/sensors",
  async (req, res): Promise<void> => {
    const parsed = GetApplianceSensorsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const appliance = await findAppliance(parsed.data.assetCode);
    if (!appliance) {
      res.status(404).json({ error: "Appliance not found" });
      return;
    }
    res.json(GetApplianceSensorsResponse.parse(await getSensorData(appliance.id)));
  },
);

router.get(
  "/appliances/:assetCode/maintenance",
  async (req, res): Promise<void> => {
    const parsed = GetApplianceMaintenanceParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const appliance = await findAppliance(parsed.data.assetCode);
    if (!appliance) {
      res.status(404).json({ error: "Appliance not found" });
      return;
    }
    const records = await db
      .select()
      .from(maintenanceRecordsTable)
      .where(eq(maintenanceRecordsTable.applianceId, appliance.id))
      .orderBy(desc(maintenanceRecordsTable.date));
    res.json(GetApplianceMaintenanceResponse.parse(records.map(serializeMaintenance)));
  },
);

router.get(
  "/appliances/:assetCode/incidents",
  async (req, res): Promise<void> => {
    const parsed = GetApplianceIncidentsParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const appliance = await findAppliance(parsed.data.assetCode);
    if (!appliance) {
      res.status(404).json({ error: "Appliance not found" });
      return;
    }
    const incidents = await db
      .select()
      .from(incidentReportsTable)
      .where(eq(incidentReportsTable.applianceId, appliance.id))
      .orderBy(desc(incidentReportsTable.createdAt));
    res.json(
      GetApplianceIncidentsResponse.parse(
        incidents.map((incident) => serializeIncident(incident, appliance.assetCode)),
      ),
    );
  },
);

router.post(
  "/appliances/:assetCode/investigate",
  async (req, res): Promise<void> => {
    const parsed = InvestigateApplianceParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const investigation = await buildInvestigation(parsed.data.assetCode);
    if (!investigation) {
      res.status(404).json({ error: "Appliance not found" });
      return;
    }
    const llmSummary = await refineInvestigationSummary({
      assetCode: investigation.appliance.asset_code,
      riskLevel: investigation.risk_level,
      riskScore: investigation.risk_score,
      summary: investigation.summary,
      evidence: investigation.evidence.map((item) => item.text),
      recommendedActions: investigation.recommended_actions,
    });
    if (llmSummary) investigation.summary = llmSummary;
    const appliance = await findAppliance(parsed.data.assetCode);
    if (appliance) {
      await refreshRisk(appliance.id);
      await writeAuditEvent(
        "INVESTIGATION",
        "SafeNest agent",
        investigation,
        appliance.id,
      );
    }
    res.json(InvestigateApplianceResponse.parse(investigation));
  },
);

router.get("/incidents", async (req, res): Promise<void> => {
  const parsed = ListIncidentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [];
  if (parsed.data.status)
    conditions.push(eq(incidentReportsTable.status, parsed.data.status));
  if (parsed.data.severity)
    conditions.push(eq(incidentReportsTable.severity, parsed.data.severity));
  const incidents = await db
    .select()
    .from(incidentReportsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(incidentReportsTable.createdAt));
  const response = await Promise.all(
    incidents.map(async (incident) => {
      const [appliance] = await db
        .select({ assetCode: appliancesTable.assetCode })
        .from(appliancesTable)
        .where(eq(appliancesTable.id, incident.applianceId));
      return serializeIncident(incident, appliance?.assetCode ?? "Unknown");
    }),
  );
  res.json(ListIncidentsResponse.parse(response));
});

router.post("/incidents", async (req, res): Promise<void> => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const appliance = await findAppliance(parsed.data.appliance_asset_code);
  if (!appliance) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }
  const [incident] = await db
    .insert(incidentReportsTable)
    .values({
      applianceId: appliance.id,
      reportedBy: parsed.data.reported_by,
      description: parsed.data.description,
      severity: parsed.data.severity,
      status: "OPEN",
    })
    .returning();
  await refreshRisk(appliance.id);
  const response = serializeIncident(incident, appliance.assetCode);
  res.status(201).json(CreateIncidentResponse.parse(response));
});

router.get("/tickets", async (req, res): Promise<void> => {
  const parsed = ListTicketsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tickets = await db
    .select({
      ticket: maintenanceTicketsTable,
      assetCode: appliancesTable.assetCode,
    })
    .from(maintenanceTicketsTable)
    .innerJoin(
      appliancesTable,
      eq(maintenanceTicketsTable.applianceId, appliancesTable.id),
    )
    .where(
      parsed.data.status
        ? eq(maintenanceTicketsTable.status, parsed.data.status)
        : undefined,
    )
    .orderBy(desc(maintenanceTicketsTable.createdAt));
  res.json(
    ListTicketsResponse.parse(
      tickets.map(({ ticket, assetCode }) => serializeTicket(ticket, assetCode)),
    ),
  );
});

router.post("/tickets", async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const appliance = await findAppliance(parsed.data.appliance_asset_code);
  if (!appliance) {
    res.status(404).json({ error: "Appliance not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(maintenanceTicketsTable)
    .where(
      and(
        eq(maintenanceTicketsTable.applianceId, appliance.id),
        eq(maintenanceTicketsTable.status, "AWAITING_APPROVAL"),
      ),
    );
  if (existing) {
    res.status(409).json({ error: "An approval request already exists for this appliance" });
    return;
  }
  const [ticket] = await db
    .insert(maintenanceTicketsTable)
    .values({
      applianceId: appliance.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      recommendedAction: parsed.data.recommended_action,
      status: "AWAITING_APPROVAL",
      createdBy: "Facility manager",
    })
    .returning();
  const response = serializeTicket(ticket, appliance.assetCode);
  res.status(201).json(CreateTicketResponse.parse(response));
});

router.post("/tickets/:ticketId/approve", async (req, res): Promise<void> => {
  const params = ApproveTicketParams.safeParse(req.params);
  const body = ApproveTicketBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [ticket] = await db
    .select({
      ticket: maintenanceTicketsTable,
      assetCode: appliancesTable.assetCode,
    })
    .from(maintenanceTicketsTable)
    .innerJoin(appliancesTable, eq(maintenanceTicketsTable.applianceId, appliancesTable.id))
    .where(eq(maintenanceTicketsTable.id, params.data.ticketId));
  if (!ticket) {
    res.status(404).json({ error: "Maintenance ticket not found" });
    return;
  }
  if (ticket.ticket.status !== "AWAITING_APPROVAL") {
    res.status(409).json({ error: "Ticket is not awaiting approval" });
    return;
  }
  const [updated] = await db
    .update(maintenanceTicketsTable)
    .set({
      status: "APPROVED",
      approvedBy: body.data.approved_by,
      approvedAt: new Date(),
    })
    .where(eq(maintenanceTicketsTable.id, params.data.ticketId))
    .returning();
  await writeAuditEvent("TICKET_APPROVED", body.data.approved_by, updated, ticket.ticket.applianceId);
  res.json(ApproveTicketResponse.parse(serializeTicket(updated, ticket.assetCode)));
});

router.post("/tickets/:ticketId/reject", async (req, res): Promise<void> => {
  const params = RejectTicketParams.safeParse(req.params);
  const body = RejectTicketBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [ticket] = await db
    .select({
      ticket: maintenanceTicketsTable,
      assetCode: appliancesTable.assetCode,
    })
    .from(maintenanceTicketsTable)
    .innerJoin(appliancesTable, eq(maintenanceTicketsTable.applianceId, appliancesTable.id))
    .where(eq(maintenanceTicketsTable.id, params.data.ticketId));
  if (!ticket) {
    res.status(404).json({ error: "Maintenance ticket not found" });
    return;
  }
  if (ticket.ticket.status !== "AWAITING_APPROVAL") {
    res.status(409).json({ error: "Ticket is not awaiting approval" });
    return;
  }
  const [updated] = await db
    .update(maintenanceTicketsTable)
    .set({ status: "REJECTED", approvedBy: body.data.approved_by, approvedAt: new Date() })
    .where(eq(maintenanceTicketsTable.id, params.data.ticketId))
    .returning();
  await writeAuditEvent("TICKET_REJECTED", body.data.approved_by, updated, ticket.ticket.applianceId);
  res.json(RejectTicketResponse.parse(serializeTicket(updated, ticket.assetCode)));
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const message = parsed.data.message.toLowerCase();
  const appliances = await listAppliances({});
  let referenced: Awaited<ReturnType<typeof listAppliances>> = [];
  if (message.includes("urgent") || message.includes("attention") || message.includes("critical")) {
    referenced = appliances.filter((item) => item.risk_level === "CRITICAL" || item.risk_level === "HIGH");
  } else if (message.includes("replace")) {
    referenced = appliances.filter((item) => item.age_years >= 5 || item.risk_level === "CRITICAL");
  } else {
    const match = appliances.find((item) => message.includes(item.asset_code.toLowerCase()));
    if (match) referenced = [match];
  }
  const first = referenced[0];
  let answer =
    referenced.length > 0
      ? `${referenced.length} appliance${referenced.length === 1 ? "" : "s"} need${referenced.length === 1 ? "s" : ""} review: ${referenced.map((item) => item.asset_code).join(", ")}.`
      : "I can investigate an appliance, list urgent equipment, or find assets that may be better candidates for replacement.";
  let riskLevel: string | null = first?.risk_level ?? null;
  let evidence: string[] = [];
  let actions: string[] = [];
  if (first) {
    const investigation = await buildInvestigation(first.asset_code);
    if (investigation) {
      evidence = investigation.evidence.map((item) => item.text);
      actions = investigation.recommended_actions;
      riskLevel = investigation.risk_level;
      if (message.includes("why")) {
        answer = `${first.asset_code} is ${investigation.risk_level} at ${investigation.risk_score}/100. ${investigation.summary}`;
      } else if (message.includes("replace")) {
        answer = `Replacement candidates include ${referenced.map((item) => `${item.asset_code} (${item.age_years.toFixed(1)} years, ${item.risk_level})`).join(", ")}. Review the repair history before approving work.`;
      }
      const llmAnswer = await refineAssistantAnswer({
        assetCode: investigation.appliance.asset_code,
        riskLevel: investigation.risk_level,
        riskScore: investigation.risk_score,
        summary: investigation.summary,
        evidence,
        recommendedActions: actions,
        draftAnswer: answer,
      });
      if (llmAnswer) answer = llmAnswer;
    }
  }
  const response = {
    answer,
    referenced_appliances: referenced.map((item) => item.asset_code),
    risk_level: riskLevel,
    evidence,
    recommended_actions: actions,
    requires_approval: referenced.some((item) => item.risk_level !== "LOW"),
  };
  res.json(SendChatMessageResponse.parse(response));
});

export default router;