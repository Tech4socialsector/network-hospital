# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class NWPSettings(Document):
	pass


@frappe.whitelist()
def get_use_nwp_agreed_rate_model():
	"""Global claim-form display flag, not sensitive data — readable by any
	logged-in user regardless of role, so claim entry never depends on who
	has been granted read access to this single doctype."""
	return frappe.db.get_single_value("NWP Settings", "use_nwp_agreed_rate_model")
