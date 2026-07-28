app_name = "nwp"
app_title = "NWP"
app_publisher = "TFSS"
app_description = "Used for provide a subsidy"
app_email = "tech4socialsector@azimpremjifoundation.org"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "nwp",
# 		"logo": "/assets/nwp/logo.png",
# 		"title": "NWP",
# 		"route": "/nwp",
# 		"has_permission": "nwp.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/nwp/css/nwp.css"
# app_include_js = "/assets/nwp/js/nwp.js"

# include js, css files in header of web template
# web_include_css = "/assets/nwp/css/nwp.css"
# web_include_js = "/assets/nwp/js/nwp.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "nwp/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "nwp/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "nwp.utils.jinja_methods",
# 	"filters": "nwp.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "nwp.install.before_install"
# after_install = "nwp.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "nwp.uninstall.before_uninstall"
# after_uninstall = "nwp.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "nwp.utils.before_app_install"
# after_app_install = "nwp.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "nwp.utils.before_app_uninstall"
# after_app_uninstall = "nwp.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "nwp.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"nwp.tasks.all"
# 	],
# 	"daily": [
# 		"nwp.tasks.daily"
# 	],
# 	"hourly": [
# 		"nwp.tasks.hourly"
# 	],
# 	"weekly": [
# 		"nwp.tasks.weekly"
# 	],
# 	"monthly": [
# 		"nwp.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "nwp.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "nwp.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "nwp.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "nwp.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["nwp.utils.before_request"]
# after_request = ["nwp.utils.after_request"]

# Job Events
# ----------
# before_job = ["nwp.utils.before_job"]
# after_job = ["nwp.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"nwp.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# Fixtures
# --------
# Export these records so other sites/team members get them via `bench migrate`
#
# Order matters: Desktop Icon links to a Workspace Sidebar record, and Workspace
# Sidebar items link to a Workspace/Page, so they must import in this sequence.
# fixture_auto_order numbers the exported filenames so import (which is otherwise
# alphabetical) follows this list instead of the doctype name.

fixture_auto_order = 1

fixtures = [
	{
		"dt": "Number Card",
		"filters": [
			[
				"name",
				"in",
				[
					"Network Hospital",
					"Patient Registration",
					"Patient Claim Form",
					"Total Aproved Budget",
					"Budget Disbursement",
					"Total Utilisation",
				],
			]
		],
	},
	{
		"dt": "Workspace",
		"filters": [
			["name", "in", ["Network Hospital", "Master", "Budget Summary", "View Dashboard"]]
		],
	},
	{
		"dt": "Workspace Sidebar",
		"filters": [
			["name", "in", ["Network Hospital", "Master", "Budget Summary", "View Dashboard"]]
		],
	},
	{
		"dt": "Desktop Icon",
		"filters": [
			["name", "in", ["Network Hospital", "Master", "Budget Summary", "View Dashboard"]]
		],
	},
]

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

