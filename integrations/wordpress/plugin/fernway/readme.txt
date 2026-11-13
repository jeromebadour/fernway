=== Fernway for WordPress ===
Contributors: jeromebadour
Tags: gohighlevel, leads, crm, forms, booking
Requires at least: 6.7
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Forms whose leads reach GoHighLevel and can be tracked: every send gets a waybill and a receipt.

== Description ==

A form for the block editor and for Elementor. What a visitor sends goes to Fernway, which delivers it into
GoHighLevel (a contact, a pipeline stage, a booked appointment) and retries by itself when GoHighLevel is busy. The
visitor sees a receipt that follows the lead in; the site owner sees every send in Settings, Fernway.

* Fields: address (read from one line into street, city, state and ZIP), name, phone (checked and put in
  international form), email, company, message, and a day and half-day picked from the route's GoHighLevel calendar.
* Works without JavaScript: the form posts to the server, which draws the receipt.
* The API key stays on the server. The browser only ever talks to this site.
* A connection test, a service-area check by ZIP, and a log of the last 50 sends, kept 30 days, with no visitor data.
* Colours, corners and the button's shape are CSS variables (`--fw-accent` and friends) a theme can set.

== Installation ==

1. Upload the plugin and activate it.
2. In the Fernway console, make an API key (API keys) and note the route the leads should take.
3. Settings, Fernway: paste the key, set the route, press Test connection.
4. Add the Fernway form block (or the Elementor widget) to a page.

== Privacy ==

What a visitor types is sent to Fernway and from there to the site owner's GoHighLevel account. This plugin keeps
none of it: its log holds only when, which route, the outcome and the waybill number.
