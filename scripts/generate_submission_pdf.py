from pathlib import Path
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
FULL_NAME = os.environ.get("FULL_NAME", "Pranav Rajeshirke")
GITHUB_URL = os.environ.get("GITHUB_URL", "https://github.com/Pranav188/zeotap-ims-assignment")
OUT = OUTPUT_DIR / f"{FULL_NAME} - Infrastructure - SRE Intern Assignment.pdf"


def p(text, style):
    return Paragraph(text.replace("&", "&amp;"), style)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="CodeBlock", parent=styles["BodyText"], fontName="Courier", fontSize=8, leading=10))
    story = []

    story.append(Paragraph("Infrastructure / SRE Intern Assignment", styles["Title"]))
    story.append(Paragraph("Mission-Critical Incident Management System", styles["Heading1"]))
    story.append(p(f"Candidate: {FULL_NAME}", styles["BodyText"]))
    story.append(p(f"GitHub Repository: {GITHUB_URL}", styles["BodyText"]))
    story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph("Overview", styles["Heading2"]))
    story.append(p(
        "This submission implements a runnable Incident Management System for high-volume signals from APIs, MCP hosts, caches, queues, RDBMS and NoSQL stores. It includes async ingestion, rate limiting, debouncing, separated persistence, alert strategies, lifecycle state validation, mandatory RCA, MTTR calculation, a responsive dashboard, tests, sample data and Docker Compose packaging.",
        styles["BodyText"],
    ))

    story.append(Paragraph("Architecture", styles["Heading2"]))
    arch = [
        ["Layer", "Implementation", "Production Equivalent"],
        ["Ingestion", "HTTP POST /api/signals with token bucket", "gRPC/Kafka/NATS ingress"],
        ["Backpressure", "50,000 item async queue with hard rejection", "Kafka partitions and DLQ"],
        ["Raw lake", "JSONL append-only audit log", "S3/OpenSearch/ClickHouse"],
        ["Source of truth", "Structured work-items JSON store", "PostgreSQL"],
        ["Hot path", "dashboard-state JSON cache", "Redis"],
        ["Aggregations", "per-minute component counters", "Prometheus/TimescaleDB"],
        ["UI", "Responsive HTMX-style dashboard", "React/Vue/HTMX app"],
    ]
    table = Table(arch, colWidths=[1.35 * inch, 2.35 * inch, 2.35 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#116466")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7d0dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f8")]),
    ]))
    story.append(table)

    story.append(Paragraph("Design Choices", styles["Heading2"]))
    for item in [
        "Strategy Pattern: component-specific alert strategies map RDBMS to P0, cache to P2 and other components to their responder channels.",
        "State Pattern: central transition guards enforce OPEN -> INVESTIGATING -> RESOLVED -> CLOSED and reject invalid state changes.",
        "Mandatory RCA: CLOSED transitions fail unless start time, end time, category, fix and prevention fields are complete.",
        "MTTR: calculated automatically from first signal timestamp to RCA end timestamp.",
        "Retry logic: store writes use bounded retry with short backoff.",
        "Observability: /health endpoint plus console throughput metrics every 5 seconds.",
    ]:
        story.append(p(f"- {item}", styles["BodyText"]))

    story.append(PageBreak())
    story.append(Paragraph("Run Instructions", styles["Heading2"]))
    story.append(Paragraph("Local", styles["Heading3"]))
    story.append(p("cd zeotap-ims-assignment/backend<br/>npm start<br/>Open http://localhost:8080", styles["CodeBlock"]))
    story.append(Paragraph("Docker Compose", styles["Heading3"]))
    story.append(p("cd zeotap-ims-assignment<br/>docker compose up --build", styles["CodeBlock"]))
    story.append(Paragraph("Tests", styles["Heading3"]))
    story.append(p("cd zeotap-ims-assignment/backend<br/>npm test", styles["CodeBlock"]))
    story.append(Paragraph("Sample Data", styles["Heading3"]))
    story.append(p("With the app running: node scripts/seed.js", styles["CodeBlock"]))

    story.append(Paragraph("Verification Completed", styles["Heading2"]))
    for item in [
        "Unit tests passed for RCA validation and MTTR calculation.",
        "Health endpoint returned status ok.",
        "105 duplicate RDBMS signals debounced into one P0 work item with 105 linked raw signals.",
        "Closing without RCA returned HTTP 400.",
        "Closing with complete RCA returned CLOSED and calculated MTTR.",
    ]:
        story.append(p(f"- {item}", styles["BodyText"]))

    story.append(Paragraph("Repository Contents", styles["Heading2"]))
    for item in [
        "/backend - Node.js IMS engine, API, state machine, tests.",
        "/frontend - responsive dashboard with live feed, detail view and RCA form.",
        "/sample-data - mock distributed-stack failure events.",
        "/scripts - seed and PDF generation scripts.",
        "/docs - plan, prompts and system design notes.",
        "docker-compose.yml - one-command runnable packaging.",
    ]:
        story.append(p(f"- {item}", styles["BodyText"]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    main()
