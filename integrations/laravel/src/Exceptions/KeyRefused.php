<?php

namespace Fernway\Laravel\Exceptions;

use RuntimeException;

/** Fernway doesn't know the API key (missing, mistyped or revoked): nothing gets through until it's fixed. */
final class KeyRefused extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Fernway refused the API key: set FERNWAY_KEY to a live key from the console (API keys).');
    }
}
