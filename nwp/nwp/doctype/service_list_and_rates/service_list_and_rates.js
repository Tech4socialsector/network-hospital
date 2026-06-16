// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

// ============================================================
// Client Script: Service List and Rates
// Feature: "Update Now" button → logs old rate to child table
// rate_history child table is always read-only (audit log)
// ===========================================================

frappe.ui.form.on("Service List and Rates", {
    refresh: function (frm) {
        // ── Lock the rate_history child table — it is an audit log ────────
        frm.set_df_property("rate_history", "read_only", 1);
        frm.get_field("rate_history").grid.cannot_add_rows    = true;
        frm.get_field("rate_history").grid.cannot_delete_rows = true;
        frm.refresh_field("rate_history");

        // ── Update Now button ──────────────────────────────────────────────
        frm.add_custom_button(__("Update Now"), function () {
            show_update_rate_dialog(frm);
        }).addClass("btn-primary");
    },
});

function show_update_rate_dialog(frm) {
    const current_from_date = frm.doc.from_date      || null;
    const current_end_date  = frm.doc.end_date       || null;
    const current_nwp       = frm.doc.nwp_percentage || "—";
    const today             = frappe.datetime.get_today();

    const period_display = current_from_date
        ? `${current_from_date} → ${current_end_date || "(no end date yet)"}`
        : "—";

    let d = new frappe.ui.Dialog({
        title: __("Update Rate"),
        fields: [
            {
                fieldtype: "HTML",
                fieldname: "current_rate_banner",
                options: `
                    <div style="
                        background:#f4f5f7;border:1px solid #d1d8dd;
                        border-radius:6px;padding:12px 16px;margin-bottom:8px;">
                        <div style="font-size:11px;color:#6c757d;font-weight:700;
                            text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">
                            Current Rate (will be saved to history)
                        </div>
                        <div style="font-size:13px;color:#333;display:flex;
                                    flex-wrap:wrap;gap:20px;">
                            <span><strong>NWP %:</strong> ${current_nwp}</span>
                            <span><strong>Period:</strong> ${period_display}</span>
                        </div>
                    </div>`,
            },

            { fieldtype: "Section Break", label: __("Close Current Rate"), collapsible: 0 },

            {
                fieldtype: "Date",
                fieldname: "close_current_rate_on",
                label: __("Close Current Rate On"),
                reqd: 0,
                default: current_end_date || "",
                read_only: current_end_date ? 1 : 0,
                description: current_end_date
                    ? __(`Auto-filled from the existing End Date (${current_end_date})`)
                    : __("Cannot be a past date or before the current From Date."),
            },

            { fieldtype: "Section Break", label: __("New Rate Details"), collapsible: 0 },

            {
                fieldtype: "Float",
                fieldname: "new_nwp_percentage",
                label: __("New Applicable Percentage Of NWP (%)"),
                reqd: 0,
                description: __("e.g. 1.0 = 1%"),
            },

            { fieldtype: "Column Break" },

            {
                fieldtype: "Date",
                fieldname: "new_start_date",
                label: __("New Effective Start Date"),
                reqd: 0,
                read_only: 1,
                description: __('Set "Close Current Rate On" first to enable this field.'),
            },

            { fieldtype: "Section Break", collapsible: 0 },

            {
                fieldtype: "Date",
                fieldname: "new_end_date",
                label: __("New Effective End Date"),
                reqd: 0,
                read_only: 0,
                description: __("Optional. Must be a future date and after New Start Date."),
            },
        ],

        primary_action_label: __("Save & Update"),
        primary_action: function (values) {
            const close_date = values.close_current_rate_on;
            const start_date = values.new_start_date;
            const end_date   = values.new_end_date;

            if (!close_date) {
                frappe.msgprint({ title: __("Close Date Required"), indicator: "orange",
                    message: __('Please enter the "Close Current Rate On" date.') });
                return;
            }
            if (current_from_date && close_date < current_from_date) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"Close Current Rate On" cannot be before the current From Date (${current_from_date}).`) });
                return;
            }
            if (!current_end_date && close_date < today) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"Close Current Rate On" cannot be a past date. Today is ${today}.`) });
                return;
            }
            if (start_date && start_date < today) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"New Effective Start Date" cannot be a past date. Today is ${today}.`) });
                return;
            }
            if (start_date && start_date <= close_date) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"New Effective Start Date" must be strictly after "Close Current Rate On" (${close_date}).`) });
                return;
            }
            if (end_date && end_date < today) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"New Effective End Date" cannot be a past date. Today is ${today}.`) });
                return;
            }
            if (end_date && end_date <= close_date) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"New Effective End Date" must be after "Close Current Rate On" (${close_date}).`) });
                return;
            }
            if (end_date && start_date && end_date < start_date) {
                frappe.msgprint({ title: __("Invalid Date"), indicator: "red",
                    message: __(`"New Effective End Date" cannot be before New Start Date (${start_date}).`) });
                return;
            }

            // Validate NWP Percentage
            if (
                values.new_nwp_percentage !== undefined &&
                values.new_nwp_percentage !== ""
            ) {
                if (values.new_nwp_percentage < 0) {
                    frappe.msgprint({
                        title: __("Invalid Percentage"),
                        indicator: "red",
                        message: __("Percentage cannot be negative.")
                    });
                    return;
                }

                if (values.new_nwp_percentage > 100) {
                    frappe.msgprint({
                        title: __("Invalid Percentage"),
                        indicator: "red",
                        message: __("Percentage cannot be greater than 100.")
                    });
                    return;
                }
            }

            frappe.confirm(
                `Are you sure you want to update the rate?<br><br>
                 <b>Current rate closed on:</b> ${close_date}<br>
                 <b>New NWP%:</b> ${values.new_nwp_percentage !== undefined && values.new_nwp_percentage !== ""
                     ? values.new_nwp_percentage + "%" : "—"}<br>
                 <b>New period:</b> ${start_date || "—"} → ${end_date || "No end date"}`,
                function () {
                    let old_row_status = close_date <= today ? "Expired" : "Active";

                    let existing_rows = (frm.doc.rate_history || []).map(function (row) {
                        return {
                            aplicable_percentage_of_nwp: row.aplicable_percentage_of_nwp,
                            start_date: row.start_date,
                            end_date  : row.end_date,
                            status    : row.status,
                        };
                    });

                    existing_rows.push({
                        aplicable_percentage_of_nwp: current_nwp,
                        start_date                 : current_from_date || null,
                        end_date                   : close_date,
                        status                     : old_row_status,
                    });

                    let updated_fields = {
                        end_date    : close_date,
                        rate_history: existing_rows,
                    };

                    if (values.new_nwp_percentage !== undefined && values.new_nwp_percentage !== "") {
                        updated_fields["nwp_percentage"] = String(values.new_nwp_percentage);
                    }
                    if (start_date) {
                        updated_fields["from_date"] = start_date;
                        updated_fields["end_date"]  = end_date || "";
                    }

                    frappe.call({
                        method: "frappe.client.set_value",
                        args: {
                            doctype  : "Service List and Rates",
                            name     : frm.doc.name,
                            fieldname: updated_fields,
                        },
                        freeze        : true,
                        freeze_message: __("Updating rate..."),
                        callback: function (r) {
                            if (!r.exc) {
                                frappe.show_alert(
                                    { message: __("Rate updated and history saved!"), indicator: "green" }, 5
                                );
                                d.hide();
                                frm.reload_doc();
                            } else {
                                frappe.msgprint({
                                    title    : __("Update Failed"),
                                    indicator: "red",
                                    message  : __("Could not update the record. Please check permissions or try again."),
                                });
                            }
                        },
                    });
                }
            );
        },
    });

    // ── Unlock new_start_date when close date is set (manual entry only) ──
    if (!current_end_date) {
        d.fields_dict.close_current_rate_on.df.onchange = function () {
            const close_date = d.get_value("close_current_rate_on");
            if (close_date) {
                if (close_date < today) {
                    frappe.show_alert({ message: __("Close date cannot be a past date."), indicator: "orange" }, 4);
                    d.set_value("close_current_rate_on", "");
                    return;
                }
                if (current_from_date && close_date < current_from_date) {
                    frappe.show_alert({ message: __(`Close date cannot be before From Date (${current_from_date}).`), indicator: "orange" }, 4);
                    d.set_value("close_current_rate_on", "");
                    return;
                }
                d.fields_dict.new_start_date.df.read_only = 0;
                d.fields_dict.new_start_date.df.description = __(`Must be a future date and strictly after ${close_date}`);
                d.fields_dict.new_start_date.refresh();
                const existing_start = d.get_value("new_start_date");
                if (existing_start && existing_start <= close_date) {
                    d.set_value("new_start_date", "");
                }
            } else {
                d.fields_dict.new_start_date.df.read_only = 1;
                d.fields_dict.new_start_date.df.description = __('Set "Close Current Rate On" first.');
                d.fields_dict.new_start_date.refresh();
                d.set_value("new_start_date", "");
            }
        };
    }

    d.fields_dict.new_start_date.df.onchange = function () {
        const start = d.get_value("new_start_date");
        const close = d.get_value("close_current_rate_on");
        if (start && start < today) {
            frappe.show_alert({ message: __("New Start Date cannot be a past date."), indicator: "orange" }, 4);
            d.set_value("new_start_date", "");
            return;
        }
        if (start && close && start <= close) {
            frappe.show_alert({ message: __(`New Start Date must be strictly after ${close}.`), indicator: "orange" }, 4);
            d.set_value("new_start_date", "");
        }
    };

    d.fields_dict.new_end_date.df.onchange = function () {
        const end   = d.get_value("new_end_date");
        const start = d.get_value("new_start_date");
        const close = d.get_value("close_current_rate_on");
        if (end && end < today) {
            frappe.show_alert({ message: __("New Effective End Date cannot be a past date."), indicator: "orange" }, 4);
            d.set_value("new_end_date", "");
            return;
        }
        if (end && close && end <= close) {
            frappe.show_alert({ message: __(`New Effective End Date must be after Close Current Rate On (${close}).`), indicator: "orange" }, 4);
            d.set_value("new_end_date", "");
            return;
        }
        if (end && start && end < start) {
            frappe.show_alert({ message: __(`New Effective End Date cannot be before New Start Date (${start}).`), indicator: "orange" }, 4);
            d.set_value("new_end_date", "");
        }
    };

    d.fields_dict.new_nwp_percentage.df.onchange = function () {
        const value = flt(d.get_value("new_nwp_percentage"));

        if (value < 0) {
            frappe.show_alert({
                message: __("Percentage cannot be negative."),
                indicator: "orange"
            }, 4);

            d.set_value("new_nwp_percentage", "");
            return;
        }

        if (value > 100) {
            frappe.show_alert({
                message: __("Percentage cannot be greater than 100."),
                indicator: "orange"
            }, 4);

            d.set_value("new_nwp_percentage", "");
            return;
        }
    };

    d.show();

    if (current_end_date) {
        setTimeout(function () {
            d.fields_dict.new_start_date.df.read_only = 0;
            d.fields_dict.new_start_date.df.description = __(`Must be a future date and strictly after ${current_end_date}`);
            d.fields_dict.new_start_date.refresh();
        }, 100);
    }
}
