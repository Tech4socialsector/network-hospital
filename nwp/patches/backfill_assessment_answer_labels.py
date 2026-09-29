import frappe


def execute():
	"""selected_option_label (and score, for rows that slipped through before
	the earlier bulk-import fix) are both fetch_from selected_option — that
	only ever ran on a live browser field-change, so every row saved before
	today keeps them blank/0 regardless of how it was created. Backfill both
	directly from Assessment Question Option for every row, on both the
	live table and the archive table, so old data exports correctly too,
	not just anything saved from now on.

	Done as one bulk UPDATE...JOIN per table/field, not a per-row Python
	loop — this site only has a handful of rows today, but the same patch
	runs unattended on every site this app is installed on, some with
	thousands of existing claims/registrations, and a per-row loop there
	would mean thousands of round trips during a deploy instead of four
	single queries.
	"""
	for doctype in ("Patient Assessment Answer", "Patient Registration History Answer"):
		frappe.db.sql(
			f"""
			UPDATE `tab{doctype}` answer
			JOIN `tabAssessment Question Option` option_doc
				ON option_doc.name = answer.selected_option
			SET answer.score = option_doc.score
			WHERE answer.selected_option != ''
			"""
		)
		frappe.db.sql(
			f"""
			UPDATE `tab{doctype}` answer
			JOIN `tabAssessment Question Option` option_doc
				ON option_doc.name = answer.selected_option
			SET answer.selected_option_label = option_doc.option_label
			WHERE answer.selected_option != ''
			"""
		)

	frappe.db.commit()
