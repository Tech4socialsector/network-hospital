import frappe

# Old label -> corrected label. Two of these exist purely to remove '<'/'>' —
# Frappe's naming rules forbid those characters in a document name, and a
# few labels use them literally (e.g. ">20 acres"), so they need rewording
# to plain text before they can become names at all.
LABEL_FIXES = {
	"Any PwD > 79% Disability - Poor": "Any PwD Greater than 79% Disability - Poor",
	"< Rs. 25,000/ - Middle Class": "Less than Rs. 25,000/ - Middle Class",
	"> Rs. 50,000/ - Very Poor": "Greater than Rs. 50,000/ - Very Poor",
	">10 acres - Well off": "Greater than 10 acres - Well off",
	">20 goats & 4 cows/buffalos - Well off": "Greater than 20 goats & 4 cows/buffalos - Well off",
	"<5 goats & 2 cows/buffalos - Poor": "Less than 5 goats & 2 cows/buffalos - Poor",
	"<5 goats & 2 cows/buffalos but <20 goats & 4 cows/buffalos - Middle Class": (
		"Less than 5 goats & 2 cows/buffalos but less than 20 goats & 4 cows/buffalos - Middle Class"
	),
}


def execute():
	"""Assessment Question Option is switching from an auto-numbered ID to
	being named by its own option_label (see the doctype's autoname) — but
	that rename has to happen BEFORE the schema change takes effect, not
	after. This patch is registered under [pre_model_sync] specifically so
	it always runs first: if the naming rule flips before existing
	documents are renamed to match, Frappe "reconciles" the mismatch
	between each document's real name and its naming field by overwriting
	the naming field with the OLD name instead of renaming the document —
	silently destroying every label's actual text. (Found out the hard way
	against a copy of this data — recovered from the fixture file, not
	from live/deployed data, but the risk is exactly the same here.)

	Two things need fixing before the rename is even possible:
	1. A handful of labels contain '<'/'>', which Frappe's naming rules
	   forbid outright in a document name — reworded to plain text first.
	2. Two different questions happen to share the exact same label
	   ("Nil - Very Poor") — name must be unique table-wide, not just per
	   question, so one needs to be disambiguated.
	Only then is every option renamed to match its own (corrected) label.
	"""
	for old_label, new_label in LABEL_FIXES.items():
		frappe.db.set_value(
			"Assessment Question Option",
			{"option_label": old_label},
			"option_label",
			new_label,
			update_modified=False,
		)

	# Disambiguate the one duplicate label — scoped to the specific question
	# it belongs to, so only that one gets touched, not every "Nil - Very
	# Poor" option.
	dupe = frappe.db.get_value(
		"Assessment Question Option",
		{
			"option_label": "Nil - Very Poor",
			"question": "Assets (T.V, Fridge, Motor Bike, Four-Wheeler, Tractor)",
		},
	)
	if dupe:
		frappe.db.set_value(
			"Assessment Question Option", dupe, "option_label", "Very Poor", update_modified=False
		)

	frappe.db.commit()

	options = frappe.get_all("Assessment Question Option", fields=["name", "option_label"])
	for option in options:
		new_name = (option.option_label or "").strip()
		if not new_name or option.name == new_name:
			continue
		if frappe.db.exists("Assessment Question Option", new_name):
			frappe.log_error(
				title="Skipped renaming Assessment Question Option",
				message=f"{option.name} -> {new_name} skipped: a document already exists with that name.",
			)
			continue
		frappe.rename_doc("Assessment Question Option", option.name, new_name, force=True)
		# Committed per-row, not once at the end — if any single rename
		# fails partway through, everything already renamed stays renamed
		# instead of silently rolling back to nothing.
		frappe.db.commit()
