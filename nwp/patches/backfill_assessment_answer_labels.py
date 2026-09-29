import frappe


def execute():
	"""selected_option_label (and score, for rows that slipped through before
	the earlier bulk-import fix) are both fetch_from selected_option — that
	only ever ran on a live browser field-change, so every row saved before
	today keeps them blank/0 regardless of how it was created. Backfill both
	directly from Assessment Question Option for every row that's missing
	them, on both the live table and the archive table, so old data exports
	correctly too, not just anything saved from now on.
	"""
	for doctype in ("Patient Assessment Answer", "Patient Registration History Answer"):
		rows = frappe.get_all(
			doctype,
			filters={"selected_option": ["!=", ""]},
			fields=["name", "selected_option", "score", "selected_option_label"],
		)
		for row in rows:
			if row.score and row.selected_option_label:
				continue
			option = frappe.db.get_value(
				"Assessment Question Option", row.selected_option, ["score", "option_label"], as_dict=True
			)
			if not option:
				continue
			updates = {}
			if not row.score:
				updates["score"] = option.score
			if not row.selected_option_label:
				updates["selected_option_label"] = option.option_label
			if updates:
				frappe.db.set_value(doctype, row.name, updates, update_modified=False)

	frappe.db.commit()
