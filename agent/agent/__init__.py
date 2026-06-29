"""Job Application Agent — Python port of the n8n workflow.

Pipeline: discover -> dedup -> LLM score + geo check -> email enrichment ->
tailored resume PDF -> cold email -> store -> notify -> follow-up -> close.
"""
