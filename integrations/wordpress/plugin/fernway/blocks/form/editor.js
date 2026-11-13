/* The Fernway form in the block editor: its settings in the sidebar, the real form drawn by the server in the canvas.
   Plain script against WordPress's own packages, so there is nothing to build. */
(function (wp) {
	"use strict";
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var c = wp.components;
	var ServerSideRender = wp.serverSideRender;

	var FIELDS = [
		["address", __("Address", "fernway")],
		["name", __("Name", "fernway")],
		["phone", __("Phone", "fernway")],
		["email", __("Email", "fernway")],
		["company", __("Company", "fernway")],
		["slot", __("Day and time (booking routes)", "fernway")],
		["message", __("Message", "fernway")]
	];

	wp.blocks.registerBlockType("fernway/form", {
		edit: function (props) {
			var a = props.attributes;
			var set = props.setAttributes;
			var labels = a.labels || {};
			var toggle = function (key, on) {
				var next = FIELDS.map(function (f) { return f[0]; }).filter(function (k) { return k === key ? on : a.fields.indexOf(k) !== -1; });
				set({ fields: next });
			};
			return el("div", useBlockProps(),
				el(InspectorControls, null,
					el(c.PanelBody, { title: __("Form", "fernway"), initialOpen: true },
						el(c.TextControl, { label: __("Route", "fernway"), help: __("Where the leads go in GoHighLevel. Empty: the default from Settings, Fernway.", "fernway"), value: a.route, onChange: function (v) { set({ route: v.toLowerCase().replace(/[^a-z0-9-]/g, "") }); } }),
						el(c.SelectControl, { label: __("Layout", "fernway"), value: a.variant, options: [{ label: __("Full, with its title", "fernway"), value: "full" }, { label: __("Compact, two fields a row", "fernway"), value: "compact" }], onChange: function (v) { set({ variant: v }); } }),
						el(c.TextControl, { label: __("Title", "fernway"), value: a.title, onChange: function (v) { set({ title: v }); } }),
						el(c.TextControl, { label: __("Button", "fernway"), value: a.submitLabel, placeholder: __("Send", "fernway"), onChange: function (v) { set({ submitLabel: v }); } }),
						el(c.TextControl, { label: __("Note beside the button", "fernway"), value: a.note, onChange: function (v) { set({ note: v }); } })
					),
					el(c.PanelBody, { title: __("Fields", "fernway"), initialOpen: true },
						FIELDS.map(function (f) {
							return el(c.CheckboxControl, { key: f[0], label: f[1], checked: a.fields.indexOf(f[0]) !== -1, onChange: function (on) { toggle(f[0], on); } });
						})
					),
					el(c.PanelBody, { title: __("Field words", "fernway"), initialOpen: false },
						a.fields.map(function (k) {
							return el(c.TextControl, { key: k, label: FIELDS.filter(function (f) { return f[0] === k; })[0][1], value: labels[k] || "", onChange: function (v) { var n = Object.assign({}, labels); n[k] = v; set({ labels: n }); } });
						})
					)
				),
				el(ServerSideRender, { block: "fernway/form", attributes: a })
			);
		},
		save: function () { return null; }
	});
})(window.wp);
