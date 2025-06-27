Here’s a focused, **one-week Proof-of-Concept (PoC) MVP Sprint** plan that your team can kick off immediately. It’s designed to validate the core RIS → Scheduling integration end-to-end, with a bare-bones UI and real HL7 message flow through Mirth Connect on AWS.

---

## 🏁 PoC MVP Sprint: Goals & Scope

**Sprint Duration:** 1 week (5 working days)
**Primary Goal:** Demonstrate real-time RIS scheduling integration for one modality (e.g. MRI) flowing through Mirth Connect into a minimal scheduling UI, with SMS confirmation.
**Success Criteria:**

* HL7 SIU message from a simulated RIS reaches Mirth Connect → transforms to JSON → arrives at Scheduling API.
* Scheduling API writes to a simple database and triggers an SMS confirmation.
* A very basic web UI displays the booked slot.
* Real-time dashboard shows message flow and success/failure.

---

## 📦 Tech Stack (PoC)

* **Middleware:** Mirth Connect (AWS EC2)
* **Backend API:** Node.js + Express
* **Database:** AWS RDS (PostgreSQL)
* **UI:** React (CRA)
* **SMS:** AWS SNS
* **Monitoring:** Mirth Dashboard + simple CloudWatch logs

---

## 🗓️ Day-by-Day Sprint Breakdown

| Day | Objectives & Tasks                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Setup & Simulators**<br>• Provision AWS EC2 for Mirth Connect<br>• Install Mirth Connect and configure one “MRI\_Scheduling” channel (SIU in → JSON out)<br>• Create a simple script to simulate RIS sending a sample SIU message to Mirth (HL7 over TCP).                                                               |
| 2   | **Transformation & API Stub**<br>• In Mirth, build a transformer mapping key fields (patient ID, datetime, modality) into JSON.<br>• Stand up Node.js scheduling API stub with endpoint `/api/schedule` that accepts JSON and writes to Postgres.<br>• Verify Mirth → API connectivity.                                    |
| 3   | **SMS & Database**<br>• Integrate AWS SNS to send an SMS confirmation when a new record is inserted.<br>• Model a minimal “appointments” table in Postgres (id, patient\_id, modality, datetime, status).<br>• Test full flow: SIU → Mirth → API → DB → SMS.                                                               |
| 4   | **UI & Dashboard**<br>• Bootstrap a React app with a single “Latest Booking” panel that polls `/api/appointments/latest`.<br>• Deploy a simple Mirth Dashboard view to monitor the “MRI\_Scheduling” channel’s message throughput and errors.<br>• Wire up the UI to display the latest appointment.                       |
| 5   | **Validation & Demo**<br>• End-to-end tests: simulate multiple SIUs, verify data accuracy, SMS delivery, UI updates.<br>• Smoke test HIPAA settings (ensure TLS on Mirth connectors, encryption-at-rest on RDS).<br>• Prepare a 10-min demo script: show HL7 injector → Mirth logs → JSON sent → SMS arrives → UI updates. |

---

## 📋 Deliverables

1. **Mirth Connect Channel** (“MRI\_Scheduling”)
2. **Scheduling API Service** (`/api/schedule`, `/api/appointments/latest`)
3. **PostgreSQL Schema** for appointments
4. **SMS Confirmation** via AWS SNS
5. **Minimal React UI** showing booked slot
6. **Real-time Monitoring** via Mirth Dashboard & CloudWatch logs
7. **Demo Script & Checklist** for stakeholder walkthrough

---

## ✅ Acceptance Criteria

* **Functional Flow:** At least one end-to-end booking (SIU → SMS → UI) completes without errors.
* **Message Monitoring:** Mirth Dashboard shows zero failed messages in PoC channel.
* **Data Integrity:** Database entries match fields from the original HL7.
* **Secure Transport:** All connectors use TLS; RDS uses AES-256 encryption.
* **Demo-Ready:** Team can run the injected HL7 sample and walk stakeholders through each step in ≤ 10 minutes.

---

## 🚀 Next Steps Post-PoC

* Expand channels to support CT, Ultrasound, Nuclear Medicine.
* Build out Admin Equipment Management UI.
* Introduce full patient intake form.
* Add real-time analytics dashboard and more robust UI flows.

---

This PoC sprint will give you a working demonstration of your core integration in **5 days**, ready to show stakeholders and validate the approach before scaling to the full two-week MVP.
