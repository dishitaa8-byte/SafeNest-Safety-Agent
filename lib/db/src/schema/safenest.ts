import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appliancesTable = pgTable("safenest_appliances", {
  id: serial("id").primaryKey(),
  assetCode: text("asset_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  location: text("location").notNull(),
  installDate: timestamp("install_date", { withTimezone: true }).notNull(),
  ageYears: numeric("age_years").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  riskLevel: text("risk_level").notNull().default("LOW"),
  riskScore: integer("risk_score").notNull().default(0),
  lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sensorReadingsTable = pgTable("safenest_sensor_readings", {
  id: serial("id").primaryKey(),
  applianceId: integer("appliance_id")
    .notNull()
    .references(() => appliancesTable.id),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  temperatureC: numeric("temperature_c").notNull(),
  currentAmps: numeric("current_amps").notNull(),
  voltage: numeric("voltage").notNull(),
  powerWatts: numeric("power_watts").notNull(),
  speedRpm: numeric("speed_rpm").notNull(),
  vibrationLevel: numeric("vibration_level").notNull(),
  mcbTripDetected: boolean("mcb_trip_detected").notNull().default(false),
  burningSmellReported: boolean("burning_smell_reported")
    .notNull()
    .default(false),
});

export const maintenanceRecordsTable = pgTable("safenest_maintenance_records", {
  id: serial("id").primaryKey(),
  applianceId: integer("appliance_id")
    .notNull()
    .references(() => appliancesTable.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  maintenanceType: text("maintenance_type").notNull(),
  description: text("description").notNull(),
  cost: numeric("cost"),
  technician: text("technician"),
  outcome: text("outcome").notNull(),
});

export const incidentReportsTable = pgTable("safenest_incident_reports", {
  id: serial("id").primaryKey(),
  applianceId: integer("appliance_id")
    .notNull()
    .references(() => appliancesTable.id),
  reportedBy: text("reported_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("OPEN"),
});

export const maintenanceTicketsTable = pgTable("safenest_maintenance_tickets", {
  id: serial("id").primaryKey(),
  applianceId: integer("appliance_id")
    .notNull()
    .references(() => appliancesTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  status: text("status").notNull().default("AWAITING_APPROVAL"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const auditEventsTable = pgTable("safenest_audit_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  applianceId: integer("appliance_id").references(() => appliancesTable.id),
  actor: text("actor").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertApplianceSchema = createInsertSchema(appliancesTable).omit({
  id: true,
});
export const insertSensorReadingSchema = createInsertSchema(
  sensorReadingsTable,
).omit({ id: true });
export const insertMaintenanceRecordSchema = createInsertSchema(
  maintenanceRecordsTable,
).omit({ id: true });
export const insertIncidentReportSchema = createInsertSchema(
  incidentReportsTable,
).omit({ id: true });
export const insertMaintenanceTicketSchema = createInsertSchema(
  maintenanceTicketsTable,
).omit({ id: true });
export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit(
  { id: true },
);

export type Appliance = z.infer<typeof insertApplianceSchema>;
export type SensorReading = z.infer<typeof insertSensorReadingSchema>;
export type MaintenanceRecord = z.infer<typeof insertMaintenanceRecordSchema>;
export type IncidentReport = z.infer<typeof insertIncidentReportSchema>;
export type MaintenanceTicket = z.infer<typeof insertMaintenanceTicketSchema>;