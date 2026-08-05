import frappe


def after_install():
	frappe.db.set_single_value("NWP Settings", "use_nwp_agreed_rate_model", 1)
