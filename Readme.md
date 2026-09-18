# SafeNest — AI Facility Safety & Preventive Maintenance Agent

> **The warning signs were there. They just weren't connected.**

SafeNest is an AI-assisted facility safety and preventive maintenance system that helps organizations identify equipment that may require urgent human attention.

It combines sensor readings, maintenance history, incident reports, appliance metadata, and deterministic risk scoring to investigate abnormal equipment behavior and recommend appropriate next steps.

The system follows a human-in-the-loop workflow:

**Detect → Investigate → Explain → Recommend → Human Approval**

SafeNest is designed to support qualified facility personnel — not replace them.

---

##  The Problem

Equipment failures rarely happen without warning.

A temperature increase, unusual current draw, declining performance, repeated circuit trips, vibration, or a reported burning smell may each appear as an isolated event.

The real problem is that these warning signs are often scattered across different sources:

- Sensor readings
- Maintenance records
- Incident reports
- Equipment age
- Previous failures
- Human observations

When these signals are not connected, important warning patterns can be overlooked.

### A real-world inspired scenario

A hostel fan was running unusually slowly.

Later, an electrical circuit tripped. The circuit was reset and the fan started running again. A burning smell was noticed, but the warning signs were not connected and no immediate action was taken.

The fan eventually caught fire.

This inspired SafeNest.

> **The goal is not to claim that AI can predict or prevent every failure.**

> The goal is to make scattered warning signals easier to investigate, prioritize, and act upon.



#  What SafeNest Does

SafeNest provides an AI-assisted safety workflow for facility managers and maintenance teams.

### 1. Detect

The system evaluates equipment data and calculates a deterministic risk score based on warning signals.

### 2. Investigate

The Safety Assistant can investigate a specific appliance and retrieve relevant evidence from the facility data.

### 3. Explain

The system presents the risk level and the signals contributing to the assessment.

### 4. Recommend

SafeNest recommends appropriate next steps such as:

- Stop using an appliance until qualified inspection
- Request technician inspection
- Prioritize maintenance
- Consider replacement
- Create a maintenance ticket

### 5. Human Approval

Safety-critical actions remain under human control.

The AI can recommend and prepare actions, but it does not independently perform irreversible safety actions.

---

## AI Safety Assistant

SafeNest includes a natural-language Safety Assistant.

Users can ask questions such as:
Investigate Fan-104
Why is Fan-104 critical?
Which appliances need attention?
How can I fix Fan-104?
The assistant uses structured facility data as evidence before generating its response.

AI is primarily used to interpret and communicate grounded information, while critical risk scoring and safety rules remain deterministic.
## Risk Scoring

SafeNest uses a deterministic risk engine rather than allowing an LLM to decide the safety score.

Example contributing signals include:

Signal	Example
Elevated temperature	+15 / +30
Current fluctuation	+15
Declining performance	+15
Repeated MCB trips	+25
Burning smell report	+35
Repeated unresolved maintenance	+15
Past expected service life	+10
Risk Levels
Score	Risk Level
0–24	LOW
25–49	MEDIUM
50–74	HIGH
75+	CRITICAL

Certain combinations of signals can also trigger higher-priority safety rules.

For example:

Burning smell + electrical anomaly → at least HIGH

Burning smell + MCB trip → CRITICAL

This keeps important safety decisions deterministic and auditable.

## Demo Scenario — Fan-104

Fan-104 is the primary demonstration asset.

Example readings:

Temperature: 67°C
Normal temperature: 35°C
Current: 1.8A
Normal current: 1.2A
RPM: 210
Normal RPM: 380
Vibration: 0.8g
Normal vibration: 0.2g
MCB trip: 1
Burning smell: Reported
Risk Score: 100/100
Risk Level: CRITICAL

SafeNest correlates these signals and recommends:

Stop using the appliance until inspected by a qualified technician.
Open a high-priority maintenance ticket for human approval.
Evaluate replacement rather than immediately attempting another repair.

The system explicitly communicates that this is a recommendation requiring human review.

## Human-in-the-Loop Safety

SafeNest is designed around human oversight.

The AI can:
Investigate equipment
Analyze available evidence
Prioritize risky assets
Explain contributing signals
Recommend maintenance actions
Suggest replacement
Draft maintenance tickets
Request human approval
The AI does not:
Guarantee fire prevention
Guarantee equipment safety
Physically disconnect equipment
Independently approve safety-critical maintenance
Replace qualified technicians
Make irreversible safety decisions without human review

AI findings are signals for qualified human review — not guarantees of fire prevention.
## Architecture
                    ┌──────────────────────┐
                    │      SafeNest UI     │
                    │   React / Vite       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     API Server       │
                    │   Node / Express     │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
       │ Risk Engine │  │ Safety Agent │  │ Maintenance  │
       │ Deterministic│ │   Gemini     │  │ / Incidents  │
       └─────────────┘  └──────────────┘  └──────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │     PostgreSQL       │
                    │      Database        │
                    └──────────────────────┘
  Request flow
User Question
     ↓
API Server
     ↓
Retrieve facility evidence
     ↓
Deterministic risk / business rules
     ↓
Grounded AI response
     ↓
Recommendation
     ↓
Human approval when required
## Tech Stack
Frontend
React
TypeScript
Vite
Modern responsive UI
Backend
Node.js
Express
TypeScript
Database
PostgreSQL
Drizzle ORM
AI
Google Gemini
Gemini is used for grounded natural-language reasoning and response generation.
Deployment
Render
GitHub

## Data Model

SafeNest maintains structured records for:

Appliances
Sensor readings
Maintenance history
Incident reports
Maintenance tickets
Audit events

Example entities:

safenest_appliances
safenest_sensor_readings
safenest_maintenance_records
safenest_incident_reports
safenest_maintenance_tickets
safenest_audit_events
## Reliability & Safety Design

A key design decision in SafeNest is separating deterministic safety logic from generative AI.

The LLM does not independently decide:

Risk score
Risk level
Approval status
Whether a safety-critical action has been completed

Instead:

Structured Data
      ↓
Deterministic Risk Engine
      ↓
Evidence
      ↓
Gemini
      ↓
Natural-language explanation

This reduces the chance of an LLM inventing safety-critical conclusions.

## Running Locally
Prerequisites
Node.js
pnpm
PostgreSQL
Gemini API key
Environment Variables

Create the required environment configuration:

DATABASE_URL=your_postgresql_connection_string
GEMINI_API_KEY=your_gemini_api_key
NODE_ENV=development

Install dependencies:

pnpm install

Push the database schema:

pnpm --filter @workspace/db run push

Build the project:

pnpm run build:safenest

Start the API server:

pnpm --filter @workspace/api-server run start
## Live Demo

Frontend:
https://safenest-frontend-4g0s.onrender.com


## Future Improvements

Potential future versions could include:

Real IoT sensor integrations
Continuous equipment monitoring
More sophisticated anomaly detection
Automatic maintenance scheduling
Technician mobile workflows
Historical risk trend visualization
Equipment-specific predictive maintenance models
Integration with facility management systems
Role-based access control
More comprehensive audit trails
⚠️ Disclaimer

SafeNest is a prototype and decision-support system.

Its recommendations are based on available data and predefined safety rules. They are not a substitute for qualified electrical, maintenance, fire-safety, or engineering professionals.

SafeNest does not guarantee prevention of equipment failure, electrical fires, injuries, or property damage.

Safety-critical decisions should always be reviewed and approved by appropriately qualified personnel.


## Core Idea

The warning signs were there. They just weren't connected.

SafeNest connects them.

