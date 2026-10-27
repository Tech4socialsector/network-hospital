import frappe

NWP_ROLES = {"System Manager", "NWP Data Entry", "NWP Approver"}


def has_app_permission():
	return frappe.session.user == "Administrator" or bool(NWP_ROLES & set(frappe.get_roles()))
