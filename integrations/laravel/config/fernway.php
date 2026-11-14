<?php

// Fernway for Laravel. Every value can come from the app's .env; publish this file only to change the defaults.
return [

    // Fernway's address. Leave it unless you run Fernway somewhere else.
    'url' => env('FERNWAY_URL', 'https://fernway.jeromebadour.com'),

    // An API key from Fernway's console (API keys). Shown once there; keep it in .env only.
    'key' => env('FERNWAY_KEY'),

    // The route a lead takes when it names none: the GHL pipeline, stage and tags it lands in.
    'route' => env('FERNWAY_ROUTE'),

    // Seconds to wait for Fernway before a send counts as not reached (and is tried again).
    'timeout' => (int) env('FERNWAY_TIMEOUT', 10),

    // Fernway::send() queues the lead. Which connection and queue carry it, and how its retries are spaced, in
    // seconds, when Fernway can't be reached or is busy. A lead Fernway refuses (a bad field) is never retried.
    'queue' => [
        'connection' => env('FERNWAY_QUEUE_CONNECTION'),
        'name' => env('FERNWAY_QUEUE', 'default'),
        'backoff' => [10, 30, 120, 600, 1800, 3600],
    ],

    // Fernway's signed webhooks: the endpoint's secret (whsec_..., shown once in Fernway's console under Webhooks),
    // the path they arrive at, and how far a delivery's time may be from now, so an old call can't be played again.
    // With no secret the route isn't registered at all.
    'webhooks' => [
        'secret' => env('FERNWAY_WEBHOOK_SECRET'),
        'path' => env('FERNWAY_WEBHOOK_PATH', 'fernway/webhook'),
        'tolerance' => 300,
    ],

];
