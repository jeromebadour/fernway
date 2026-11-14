<?php

use Fernway\Laravel\Http\VerifySignature;
use Fernway\Laravel\Http\WebhookController;
use Illuminate\Support\Facades\Route;

// Outside the web group on purpose: no session, no CSRF token (Fernway signs instead), no cookies.
Route::post(config('fernway.webhooks.path'), WebhookController::class)
    ->middleware(VerifySignature::class)
    ->name('fernway.webhook');
