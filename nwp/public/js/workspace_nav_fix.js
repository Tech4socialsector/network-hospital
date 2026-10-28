// Newer Frappe v16 builds nest workspace/page routes under the app name
// (e.g. /desk/nwp/master) but the sidebar's own route-builder still emits
// the older un-prefixed form (/desk/master), so clicking between our
// workspaces silently does nothing. This detects whether the nested form
// is actually what the current site expects (by reading the URL we're
// already sitting on) and only rewrites our own sidebar links to match.
(function () {
	const NWP_APP = "nwp";
	const NWP_SLUGS = ["network-hospital", "master", "budget-summary", "view-dashboard", "nwp-dashboard"];

	function nested_prefix_active() {
		let parts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
		return parts.length > 2 && (parts[0] === "desk" || parts[0] === "app") && parts[1] === NWP_APP;
	}

	function rewrite_path(path) {
		if (!path || !nested_prefix_active()) return path;

		let m = path.match(/^(\/?(?:desk|app))\/([^/]+)$/);
		if (m && NWP_SLUGS.includes(m[2])) {
			return m[1] + "/" + NWP_APP + "/" + m[2];
		}
		if (NWP_SLUGS.includes(path)) {
			return NWP_APP + "/" + path;
		}
		return path;
	}

	frappe.ready(function () {
		if (!(frappe.ui && frappe.ui.sidebar_item && frappe.ui.sidebar_item.TypeLink)) return;

		const original_get_path = frappe.ui.sidebar_item.TypeLink.prototype.get_path;
		frappe.ui.sidebar_item.TypeLink.prototype.get_path = function () {
			return rewrite_path(original_get_path.apply(this, arguments));
		};
	});
})();
