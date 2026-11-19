interface PropertyEnvironment {
    CI?: string;
    FC_RUNS?: string;
    [key: string]: string | undefined;
}

export function propertyRuns(env: PropertyEnvironment): number {
    const ci = env.CI !== undefined;
    const minimum = ci ? 1000 : 50;
    const configured = Number(env.FC_RUNS ?? minimum);
    if (!Number.isSafeInteger(configured) || configured < 1)
        throw new RangeError('FC_RUNS doit être un entier positif');
    return ci ? Math.max(configured, minimum) : configured;
}
