"""Seed primary source documents and chunks for top portfolio and research stocks."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "db", "finn.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

DOCS_DATA = [
    {
        "ticker": "TATAMOTORS",
        "ar_title": "Tata Motors Annual Report FY24",
        "ar_period": "FY24",
        "ar_url": "https://www.tatamotors.com/wp-content/uploads/2024/07/Tata-Motors-Annual-Report-2023-24.pdf",
        "ar_path": "data/documents/demo/TATAMOTORS_AR_FY24.pdf",
        "ar_pages": 340,
        "ar_chunks": [
            ("Chairman Statement: Tata Motors achieved record consolidated revenues of ₹4,37,928 crore and all-time high profit of ₹31,807 crore in FY24. JLR delivered record full-year performance with revenues of £29.0 billion. CV business demonstrated strong margin improvement to 10.6% EBITDA.", "Chairman Statement", 6),
            ("Debt Reduction & Balance Sheet: Net automotive debt reduced dramatically to ₹16,000 crore, on track to achieve net auto-debt-free status in FY25. Commercial Vehicles free cash flow reached ₹10,800 crore.", "Financial Position", 34)
        ],
        "cc_title": "Tata Motors Q2 FY25 Concall Transcript",
        "cc_period": "Q2 FY25",
        "cc_url": "https://www.tatamotors.com/wp-content/uploads/2024/11/transcript-q2-fy25.pdf",
        "cc_pages": 44,
        "cc_chunks": [
            ("Management Opening: Q2 FY25 consolidated revenue was ₹1,01,450 crore with EBITDA margin at 11.4%. JLR EBIT margin remained robust at 5.1% despite aluminium supply disruption. India CV demand stabilized in infrastructure segments.", "Earnings Remarks", 4)
        ]
    },
    {
        "ticker": "TITAN",
        "ar_title": "Titan Company Annual Report FY24",
        "ar_period": "FY24",
        "ar_url": "https://www.titancompany.in/investors/annual-reports/2023-24.pdf",
        "ar_path": "data/documents/demo/TITAN_AR_FY24.pdf",
        "ar_pages": 260,
        "ar_chunks": [
            ("Managing Director Review: Titan crossed ₹51,000 crore in total income with jewellery business growing 20% YoY. Tanishq opened 42 new domestic stores. CaratLane grew 42% YoY reaching ₹2,900 crore revenue.", "MD Review", 10),
            ("Balance Sheet Highlights: Working capital was ₹12,400 crore primarily in gold and diamond inventory. Return on Equity (ROE) stood at 31.2%. Consolidated debt remained well within manageable limits.", "Financial Review", 52)
        ],
        "cc_title": "Titan Q2 FY25 Earnings Call Transcript",
        "cc_period": "Q2 FY25",
        "cc_url": "https://www.titancompany.in/investors/quarterly-results/q2-fy25-transcript.pdf",
        "cc_pages": 32,
        "cc_chunks": [
            ("Management Commentary: Q2 revenue grew 25% YoY spurred by customs duty reduction on gold imports. Buyer growth was up 18%. Watches and Wearables division grew 15% with premium analog brands gaining market share.", "Operational Highlights", 3)
        ]
    },
    {
        "ticker": "WIPRO",
        "ar_title": "Wipro Limited Annual Report FY24",
        "ar_period": "FY24",
        "ar_url": "https://www.wipro.com/content/dam/nexus/en/investor/annual-reports/2023-2024/annual-report-2023-2024.pdf",
        "ar_path": "data/documents/demo/WIPRO_AR_FY24.pdf",
        "ar_pages": 290,
        "ar_chunks": [
            ("CEO Message: Focused on large deal execution and artificial intelligence acceleration with Wipro ai360. Gross revenue was ₹89,760 crore with operating margin holding at 16.1%. Delivered operating cash flow of ₹17,620 crore.", "CEO Message", 12),
            ("Capital Allocation: Net cash position stood at ₹22,400 crore. Returned ₹12,000 crore to shareholders through share buyback in FY24.", "Capital Allocation", 60)
        ],
        "cc_title": "Wipro Q2 FY25 Earnings Conference Call Transcript",
        "cc_period": "Q2 FY25",
        "cc_url": "https://www.wipro.com/content/dam/nexus/en/investor/quarterly-results/2024-2025/q2/q2-fy25-transcript.pdf",
        "cc_pages": 36,
        "cc_chunks": [
            ("Management Remarks: Q2 constant currency revenue grew 0.6% sequentially. Operating margin expanded 40 bps QoQ to 16.8%. Large deal bookings were $1.5 billion, with Capco consulting business demonstrating sequential growth.", "Performance Summary", 2)
        ]
    },
    {
        "ticker": "ZOMATO",
        "ar_title": "Zomato Limited Annual Report FY24",
        "ar_period": "FY24",
        "ar_url": "https://b.zmtcdn.com/investor_relations/shareholder_reports/annual_report_fy24.pdf",
        "ar_path": "data/documents/demo/ZOMATO_AR_FY24.pdf",
        "ar_pages": 210,
        "ar_chunks": [
            ("Letter to Shareholders: FY24 was the first full year of consolidated profitability with PAT of ₹351 crore. Blinkit quick commerce GOV grew 93% YoY and achieved adjusted EBITDA breakeven in March 2024.", "Shareholder Letter", 5),
            ("Balance Sheet & Cash: Cash and short-term liquid investments stood at ₹12,240 crore. Working capital is negative due to quick vendor turnover. Zero long-term debt.", "Treasury & Liquidity", 45)
        ],
        "cc_title": "Zomato Q2 FY25 Shareholder Call Transcript",
        "cc_period": "Q2 FY25",
        "cc_url": "https://b.zmtcdn.com/investor_relations/shareholder_reports/q2_fy25_transcript.pdf",
        "cc_pages": 28,
        "cc_chunks": [
            ("CEO Commentary: Blinkit store count reached 791 stores, with target to reach 2,000 stores by end of 2026. Food delivery GOV grew 21% YoY. Acquisition of Paytm ticketing business expands Going-out segment.", "Strategic Review", 2)
        ]
    }
]

for item in DOCS_DATA:
    c.execute("SELECT id FROM companies WHERE ticker = ?", (item["ticker"],))
    row = c.fetchone()
    if not row:
        continue
    comp_id = row[0]
    
    # Check if already seeded
    c.execute("SELECT COUNT(*) FROM source_documents WHERE company_id = ?", (comp_id,))
    count = c.fetchone()[0]
    if count > 0:
        print(f"{item['ticker']} already has {count} source documents.")
        continue
        
    # Insert Annual Report
    c.execute("""
        INSERT INTO source_documents (company_id, document_type, title, financial_period, publication_date, source_url, local_path, status, page_count, is_demo)
        VALUES (?, 'annual_report', ?, ?, '2024-06-25', ?, ?, 'processed', ?, 1)
    """, (comp_id, item["ar_title"], item["ar_period"], item["ar_url"], item["ar_path"], item["ar_pages"]))
    ar_id = c.lastrowid
    
    for idx, (content, heading, pg) in enumerate(item["ar_chunks"]):
        c.execute("""
            INSERT INTO document_chunks (source_document_id, chunk_index, content, section_heading, page_number, chunk_type)
            VALUES (?, ?, ?, ?, ?, 'text')
        """, (ar_id, idx, content, heading, pg))
        
    # Insert Concall Transcript
    cc_path = item.get("cc_path", f"data/documents/demo/{item['ticker']}_Q2FY25_Concall.pdf")
    c.execute("""
        INSERT INTO source_documents (company_id, document_type, title, financial_period, publication_date, source_url, local_path, status, page_count, is_demo)
        VALUES (?, 'concall_transcript', ?, ?, '2024-10-25', ?, ?, 'processed', ?, 1)
    """, (comp_id, item["cc_title"], item["cc_period"], item["cc_url"], cc_path, item["cc_pages"]))
    cc_id = c.lastrowid
    
    for idx, (content, heading, pg) in enumerate(item["cc_chunks"]):
        c.execute("""
            INSERT INTO document_chunks (source_document_id, chunk_index, content, section_heading, page_number, chunk_type)
            VALUES (?, ?, ?, ?, ?, 'text')
        """, (cc_id, idx, content, heading, pg))

    print(f"Successfully seeded documents for {item['ticker']}!")

conn.commit()
print("All source documents verified.")
