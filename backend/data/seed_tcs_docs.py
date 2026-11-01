"""Seed TCS documents into SQLite database."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "db", "finn.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT id FROM companies WHERE ticker = 'TCS'")
row = c.fetchone()
if not row:
    print("TCS company not found")
    exit(1)
tcs_id = row[0]

c.execute("SELECT COUNT(*) FROM source_documents WHERE company_id = ?", (tcs_id,))
count = c.fetchone()[0]
print(f"Existing TCS docs: {count}")

if count == 0:
    c.execute("""
        INSERT INTO source_documents (company_id, document_type, title, financial_period, publication_date, source_url, local_path, status, page_count, is_demo)
        VALUES (?, 'annual_report', 'Tata Consultancy Services Annual Report FY24', 'FY24', '2024-06-18', 'https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2023-24/ar/annual-report-2023-2024.pdf', 'data/documents/demo/TCS_AR_FY24.pdf', 'processed', 284, 1)
    """, (tcs_id,))
    ar_id = c.lastrowid
    
    c.execute("""
        INSERT INTO source_documents (company_id, document_type, title, financial_period, publication_date, source_url, local_path, status, page_count, is_demo)
        VALUES (?, 'concall_transcript', 'TCS Q2 FY25 Earnings Conference Call Transcript', 'Q2 FY25', '2024-10-10', 'https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q2/transcript.pdf', 'data/documents/demo/TCS_Q2FY25_Concall.pdf', 'processed', 38, 1)
    """, (tcs_id,))
    cc_id = c.lastrowid
    
    # Insert chunks for AR
    c.execute("""
        INSERT INTO document_chunks (source_document_id, chunk_index, content, section_heading, page_number, chunk_type)
        VALUES (?, 0, 'CEO Statement FY24: Tata Consultancy Services delivered resilient growth in FY24, achieving consolidated revenue of ₹2,40,893 crore (+6.8% YoY) and net income of ₹45,908 crore (+10.5% YoY). Operating margin remained industry-leading at 24.6%. Our AI-first transformation suite, TCS AI WisdomNext, is being deployed across 300+ enterprise clients.', 'CEO Statement to Shareholders', 8, 'text')
    """, (ar_id,))
    
    c.execute("""
        INSERT INTO document_chunks (source_document_id, chunk_index, content, section_heading, page_number, chunk_type)
        VALUES (?, 1, 'Balance Sheet & Cash Flow Strength: Cash and cash equivalents and investments stood at ₹51,840 crore. Free cash flow generation reached ₹44,260 crore, representing a 100% conversion of net profit. Working capital days improved to 68 days. Total equity stood at ₹90,490 crore with zero net debt.', 'Capital Allocation & Balance Sheet Highlights', 42, 'text')
    """, (ar_id,))
    
    # Insert chunks for Concall
    c.execute("""
        INSERT INTO document_chunks (source_document_id, chunk_index, content, section_heading, page_number, chunk_type)
        VALUES (?, 0, 'Management Opening Remarks: In Q2 FY25, revenue grew 5.5% YoY in constant currency to ₹64,259 crore. EBIT margin expanded to 24.1%. Deal wins were robust with total contract value (TCV) at $8.6 billion. North America grew 2.1% QoQ, reflecting stabilization in BFSI discretionary spend.', 'Management Commentary', 3, 'text')
    """, (cc_id,))
    
    conn.commit()
    print("Seeded TCS source documents and chunks successfully!")
else:
    print("TCS source documents already present.")

