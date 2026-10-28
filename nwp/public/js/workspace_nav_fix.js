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

	function apply_patch() {
		if (!(frappe.ui && frappe.ui.sidebar_item && frappe.ui.sidebar_item.TypeLink)) return false;

		const proto = frappe.ui.sidebar_item.TypeLink.prototype;
		if (proto.get_path.__nwp_patched) return true;

		const original_get_path = proto.get_path;
		proto.get_path = function () {
			return rewrite_path(original_get_path.apply(this, arguments));
		};
		proto.get_path.__nwp_patched = true;
		return true;
	}

	if (!apply_patch()) {
		// frappe.ui.sidebar_item may not be loaded yet depending on bundle
		// order/version; poll briefly instead of depending on a readiness API.
		let attempts = 0;
		let timer = setInterval(function () {
			attempts++;
			if (apply_patch() || attempts > 40) {
				clearInterval(timer);
			}
		}, 250);
	}
})();
