<?php

namespace Fernway\Laravel\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static string send(\Fernway\Laravel\Lead $lead)
 * @method static \Fernway\Laravel\Sent sendNow(\Fernway\Laravel\Lead $lead)
 * @method static array slots(?string $route = null)
 * @method static array lead(string $number)
 *
 * @see \Fernway\Laravel\Fernway
 */
class Fernway extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \Fernway\Laravel\Fernway::class;
    }
}
