"""Offline smoke for the website-audit writer — no network, no keys.

Validates: HTML parse/strip, fragment sanitizer (drops <a>/<script>), and the
full email assembly (no leftover ${...} placeholders). Run with any python that
has `requests` available (for the module imports):
    python -m scripts.smoke_audit_offline
"""
from agent.audit import scrape, email_writer

FAILS = []


def check(name, cond):
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        FAILS.append(name)


SAMPLE_HTML = """
<html><head><title>Bright Smile Dental — Austin TX</title>
<meta name="description" content="Family &amp; cosmetic dentistry in Austin."></head>
<body><script>var x=1;</script><style>.a{color:red}</style>
<h1>Welcome to Bright Smile Dental</h1>
<p>We offer cleanings, whitening, Invisalign and emergency care. Book online or call today.
Serving Austin families for 12 years. Our friendly team makes every visit easy.</p>
</body></html>
"""

print("== parse_site ==")
site = scrape.parse_site(SAMPLE_HTML)
print("   title:", site["title"])
print("   meta :", site["meta"])
print("   len  :", site["content_length"])
check("title extracted", "Bright Smile Dental" in site["title"])
check("meta decoded (&amp; -> &)", "&" in site["meta"] and "&amp;" not in site["meta"])
check("script/style stripped", "var x" not in site["text"] and "color:red" not in site["text"])
check("content over gate", site["content_length"] >= scrape.MIN_CONTENT)

print("== domain/normalize ==")
check("normalize adds https", scrape.normalize_url("brightsmile.com") == "https://brightsmile.com")
check("domain strips www/path", scrape.domain_of("https://www.brightsmile.com/x") == "brightsmile.com")

print("== sanitize_fragment ==")
dirty = '<p>ok</p><a href="http://evil">link</a><script>bad()</script><img src=x>'
clean = email_writer.sanitize_fragment(dirty)
print("   ->", clean)
check("keeps <p>", "<p" in clean)
check("drops <a>", "<a" not in clean and "evil" not in clean)
check("drops <script>", "script" not in clean and "bad()" not in clean)
check("drops <img>", "<img" not in clean)

print("== build_email (AI present) ==")
settings = {
    "agency_name": "OneCrew Technologies", "tagline": "We ship. You scale.",
    "sender_name": "Sami", "sender_title": "OneCrew Technologies",
    "sender_email": "support@onecrewtech.com", "sender_phone": "+92 333 0000000",
    "sender_address": "OneCrew · 123 Main St", "unsubscribe_url": "https://onecrewtech.com/unsub",
    "calendar_link": "https://onecrewtech.com/contact", "website_url": "https://www.onecrewtech.com",
    "hero_url": "https://example.com/hero.jpg", "logo_url": "", "sign_img_url": "",
}
lead = {"email": "owner@brightsmile.com", "first_name": "Dana", "company": "Bright Smile Dental",
        "job_title": "Owner", "website": "brightsmile.com", "industry": "dental",
        "city": "Austin", "state": "TX", "employees": "8", "revenue": "1M"}
ai = {
    "business_name": "Bright Smile Dental",
    "website_summary": "a family and cosmetic dental clinic in Austin",
    "pain_point": "Every evening patients searching for a dentist hit your site, find no way to book, and call the practice down the street instead.",
    "gaps": ["No online booking", "Slow lead follow-up"],
    "subject_line": "Booking ideas for Bright Smile",
    "growth_section_html": '<p style="margin:0 0 14px;">A quick look shows opportunity.</p>'
                           '<ul style="margin:0;"><li><strong>Online booking</strong> &mdash; fewer phone calls</li></ul>',
}
built = email_writer.build_email(settings, lead, site, ai)
html = built["html"]
print("   subject:", built["subject"])
print("   to     :", built["to"])
print("   html len:", len(html))
check("no leftover ${ placeholders", "${" not in html)
check("hero rendered (hero_url set)", "hero.jpg" in html)
check("greet uses first name", "Hi Dana," in html)
check("business name in body", "Bright Smile Dental" in html)
check("pain-point opens the body", "call the practice down the street" in html)
check("AI growth section used (not fallback)", "fewer phone calls" in html)
check("subject in <title>", "<title>Booking ideas for Bright Smile</title>" in html)

print("== build_email (AI empty -> fallbacks) ==")
built2 = email_writer.build_email(settings, lead, site, {})
html2 = built2["html"]
check("subject fallback", built2["subject"].startswith("A few AI ideas for"))
check("fallback growth used", "we ship, you scale" in html2)
check("no leftover ${ placeholders (2)", "${" not in html2)

# Write a preview to eyeball in a browser.
import pathlib
out = pathlib.Path(__file__).with_name("_audit_preview.html")
out.write_text(html, encoding="utf-8")
print("\npreview written ->", out)

print("\nRESULT:", "OFFLINE SMOKE CLEAN" if not FAILS else f"{len(FAILS)} FAILURE(S): {FAILS}")
raise SystemExit(1 if FAILS else 0)
