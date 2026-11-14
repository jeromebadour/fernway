<?php

namespace Fernway\Laravel\Exceptions;

use RuntimeException;

/** Fernway didn't take the lead this time (busy, down, or no answer): the same lead can be sent again safely. */
final class Unreachable extends RuntimeException
{
    public function __construct(string $why, public readonly ?int $status = null, public readonly ?int $retryAfter = null)
    {
        parent::__construct($why);
    }
}
