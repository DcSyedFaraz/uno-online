"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { activeExtras, resetToClassic, STACKING_LABELS, type ExtraCardKey, type RuleSettings } from "@/engine";
import { sendAction } from "@/client/actions";
import { CARD_HELP, RULE_HELP } from "./ruleInfo";

type Patch = Partial<Omit<RuleSettings, "cards">> & { cards?: Partial<RuleSettings["cards"]> };

function update(patch: Patch) {
  void sendAction({ type: "update_settings", settings: patch });
}

function Info({ text }: { text: string }) {
  return (
    <span className="group relative ml-1.5 inline-grid h-4 w-4 cursor-help place-items-center rounded-full bg-white/25 text-[10px] font-bold text-white">
      ?
      <span className="pointer-events-none absolute bottom-6 left-1/2 z-50 w-60 -translate-x-1/2 rounded-xl bg-white p-3 text-left text-xs font-medium leading-relaxed text-ink opacity-0 shadow-[0_4px_0_rgba(10,30,90,0.3),0_14px_30px_-10px_rgba(0,0,0,0.4)] transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed ${on ? "bg-accent shadow-[inset_0_0_0_2px_rgba(255,255,255,0.45)]" : "bg-[#133f99]/70"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-[#133f99]/60 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled && o.value !== value}
          onClick={() => !disabled && onChange(o.value)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            o.value === value ? "bg-white text-ink shadow" : "text-white/85 hover:bg-white/15 disabled:opacity-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center text-sm font-medium text-white">
        {label}
        {help && <Info text={help} />}
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-2 ring-1 ring-white/20 short:px-3">
      <div className="pt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{title}</div>
      {children}
    </div>
  );
}

export function RulesPanel({ settings, editable }: { settings: RuleSettings; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const extras = activeExtras(settings);
  const ro = !editable;

  return (
    <div className="space-y-3">
      <Group title="Basics">
        <Row label="Cards per hand" help={RULE_HELP.handSize}>
          <Segmented value={settings.handSize} disabled={ro} onChange={(handSize) => update({ handSize })} options={[5, 6, 7, 8, 9, 10].map((n) => ({ value: n, label: String(n) }))} />
        </Row>
        <Row label="Turn timer" help={RULE_HELP.turnTimerSec}>
          <Segmented
            value={settings.turnTimerSec}
            disabled={ro}
            onChange={(turnTimerSec) => update({ turnTimerSec })}
            options={[0, 15, 30, 45, 60].map((n) => ({ value: n as RuleSettings["turnTimerSec"], label: n ? `${n}s` : "Off" }))}
          />
        </Row>
        <Row label="Time limit" help={RULE_HELP.roundTimerMin}>
          <Segmented
            value={settings.roundTimerMin}
            disabled={ro}
            onChange={(roundTimerMin) => update({ roundTimerMin })}
            options={[0, 3, 5, 7].map((n) => ({ value: n as RuleSettings["roundTimerMin"], label: n ? `${n} min` : "Off" }))}
          />
        </Row>
        <Row label="Teams" help={RULE_HELP.teamPlay}>
          <Segmented
            value={settings.teamPlay ? "pairs" : "off"}
            disabled={ro}
            onChange={(v) => update({ teamPlay: v === "pairs" })}
            options={[
              { value: "off" as const, label: "Off" },
              { value: "pairs" as const, label: "2v2 pairs" },
            ]}
          />
        </Row>
        <Row label="Win by" help={RULE_HELP.winMode}>
          <Segmented
            value={settings.winMode}
            disabled={ro}
            onChange={(winMode) => update({ winMode })}
            options={[
              { value: "single", label: "1 round" },
              { value: "points", label: "Points" },
            ]}
          />
        </Row>
        {settings.winMode === "points" && (
          <Row label="Target score">
            <Segmented
              value={settings.targetPoints}
              disabled={ro}
              onChange={(targetPoints) => update({ targetPoints })}
              options={[200, 300, 500, 1000].map((n) => ({ value: n, label: String(n) }))}
            />
          </Row>
        )}
        <Row label="Decks" help={RULE_HELP.deckCount}>
          <Segmented
            value={settings.deckCount}
            disabled={ro}
            onChange={(deckCount) => update({ deckCount })}
            options={[
              { value: "auto" as const, label: "Auto" },
              { value: 1 as const, label: "1" },
              { value: 2 as const, label: "2" },
              { value: 3 as const, label: "3" },
            ]}
          />
        </Row>
      </Group>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl bg-gold px-4 py-3 text-left text-ink shadow-[0_4px_0_#a87400] transition hover:brightness-105"
        aria-expanded={open}
      >
        <div>
          <div className="font-display text-sm font-bold tracking-wide">More rules</div>
          <div className="text-xs font-medium text-ink/70">{extras.length ? `${extras.length} extra rule${extras.length > 1 ? "s" : ""} on` : "Classic rules — every extra is off"}</div>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-ink/70">
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-3 overflow-hidden"
          >
            <Group title="Stacking">
              <Row label="Stack draw cards" help={RULE_HELP.stacking}>
                <Toggle label="Stacking" on={settings.stacking !== "off"} disabled={ro} onChange={(v) => update({ stacking: v ? "higher" : "off" })} />
              </Row>
              {settings.stacking !== "off" && (
                <div className="pb-2">
                  <Segmented
                    value={settings.stacking}
                    disabled={ro}
                    onChange={(stacking) => update({ stacking })}
                    options={(["same", "mixed", "higher"] as const).map((v) => ({ value: v, label: STACKING_LABELS[v] }))}
                  />
                </div>
              )}
            </Group>

            <Group title="Special numbers">
              <Row label="7 = swap hands" help={RULE_HELP.sevenSwap}>
                <Toggle label="7 swap" on={settings.sevenSwap} disabled={ro} onChange={(sevenSwap) => update({ sevenSwap })} />
              </Row>
              <Row label="0 = pass hands along" help={RULE_HELP.zeroRotate}>
                <Toggle label="0 rotate" on={settings.zeroRotate} disabled={ro} onChange={(zeroRotate) => update({ zeroRotate })} />
              </Row>
            </Group>

            <Group title="Speed">
              <Row label="Jump-in" help={RULE_HELP.jumpIn}>
                <Toggle label="Jump-in" on={settings.jumpIn} disabled={ro} onChange={(jumpIn) => update({ jumpIn })} />
              </Row>
            </Group>

            <Group title="Drawing">
              <Row label="Draw until playable" help={RULE_HELP.drawUntilPlayable}>
                <Toggle label="Draw until playable" on={settings.drawUntilPlayable} disabled={ro} onChange={(drawUntilPlayable) => update({ drawUntilPlayable })} />
              </Row>
              <Row label="Must play the drawn card" help={RULE_HELP.forcePlayDrawn}>
                <Toggle label="Force play" on={settings.forcePlayDrawn} disabled={ro} onChange={(forcePlayDrawn) => update({ forcePlayDrawn })} />
              </Row>
            </Group>

            <Group title="Wild +4">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center text-sm font-medium text-white">
                  How it works <Info text={RULE_HELP.wild4Mode} />
                </span>
                <Segmented
                  value={settings.wild4Mode}
                  disabled={ro}
                  onChange={(wild4Mode) => update({ wild4Mode })}
                  options={[
                    { value: "challenge", label: "Challenge" },
                    { value: "free", label: "Anytime" },
                    { value: "restricted", label: "No color match only" },
                  ]}
                />
              </div>
            </Group>

            <Group title="Extra cards">
              {(Object.keys(CARD_HELP) as ExtraCardKey[]).map((k) => (
                <Row key={k} label={CARD_HELP[k].title} help={CARD_HELP[k].text}>
                  <Toggle label={CARD_HELP[k].title} on={settings.cards[k]} disabled={ro} onChange={(v) => update({ cards: { [k]: v } })} />
                </Row>
              ))}
            </Group>

            <Group title="Penalties">
              <Row label="Mercy rule" help={RULE_HELP.mercyRule}>
                <div className="flex items-center gap-2">
                  {settings.mercyRule && (
                    <Segmented
                      value={settings.mercyLimit}
                      disabled={ro}
                      onChange={(mercyLimit) => update({ mercyLimit })}
                      options={[20, 25, 30].map((n) => ({ value: n, label: `${n}` }))}
                    />
                  )}
                  <Toggle label="Mercy rule" on={settings.mercyRule} disabled={ro} onChange={(mercyRule) => update({ mercyRule })} />
                </div>
              </Row>
              <Row label="Missed shout penalty" help={RULE_HELP.unoPenalty}>
                <Segmented value={settings.unoPenalty} disabled={ro} onChange={(unoPenalty) => update({ unoPenalty })} options={[1, 2, 4].map((n) => ({ value: n, label: `+${n}` }))} />
              </Row>
            </Group>

            <Group title="Idle players">
              <Row label="AFK autopilot" help={RULE_HELP.afkAutopilot}>
                <div className="flex items-center gap-2">
                  {settings.afkAutopilot && (
                    <Segmented
                      value={settings.afkThreshold}
                      disabled={ro}
                      onChange={(afkThreshold) => update({ afkThreshold })}
                      options={[1, 2, 3].map((n) => ({ value: n, label: `${n}×` }))}
                    />
                  )}
                  <Toggle label="AFK autopilot" on={settings.afkAutopilot} disabled={ro} onChange={(afkAutopilot) => update({ afkAutopilot })} />
                </div>
              </Row>
            </Group>

            {editable && extras.length > 0 && (
              <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => update(stripBasics(resetToClassic(settings)))}>
                Reset to classic
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function stripBasics(s: RuleSettings): Patch {
  const { handSize, turnTimerSec, roundTimerMin, winMode, teamPlay, targetPoints, deckCount, ...rest } = s;
  void teamPlay;
  void handSize;
  void turnTimerSec;
  void roundTimerMin;
  void winMode;
  void targetPoints;
  void deckCount;
  return rest;
}
