/** Relógio do SLA; injetável para fixar "agora" nos testes. */
export type SlaClock = () => Date;

export const SLA_CLOCK = Symbol("SLA_CLOCK");

export const systemSlaClock: SlaClock = () => new Date(Date.now());
