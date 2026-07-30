# Why Torque Available Falls When Anti-Ice Is On
### And why subtracting 8 % is not enough

**CH-149 Cormorant — plain-language brief**
Prepared 28 July 2026

---

## The short version

When we select anti-ice, we tell the crew to subtract 8 % torque from what the chart says is available.

The Flight Manual's own charts say the correct number is closer to **15 %**.

The 8 % figure describes an anti-ice system running so weakly that we would reject it as unserviceable. This document explains why, in steps, with no assumed engine knowledge.

---

## Step 1 — What limits the engine

A turbine engine is limited by heat. There is a maximum temperature the turbine can survive, measured as **TIT** — turbine inlet temperature.

The engine does not run out of fuel or air first. It runs out of temperature. When TIT reaches the limit, that is all the power you get, no matter how much more fuel you push in.

So **torque available means: how much torque can this engine make before it gets too hot.**

Hold on to that. Everything follows from it.

---

## Step 2 — What anti-ice actually does to the engine

Engine anti-ice works by stealing hot, compressed air from partway through the engine and piping it to the places that need warming.

That stolen air was on its way to the burner. It was going to help make power. Now it is gone.

The engine still has to produce whatever torque you are asking of it, but it has less air to do it with. So it burns more fuel per unit of air, and **it runs hotter**.

You see this every time you check the system. Select anti-ice, and TIT jumps. We expect a **minimum of 30 °C**. We often see closer to **40 °C**. If we check the system at 760 and do not see at least 790, we say the anti-ice is not working.

**That temperature jump is not a side effect. It is the whole story.**

---

## Step 3 — Why a hotter engine has less torque available

The temperature limit has not moved. The engine is still allowed exactly the same maximum TIT it was allowed before.

But you have just spent 30 to 40 °C of your remaining margin on anti-ice.

If you were near the limit already, you cannot stay where you were. You have to pull back on torque until the temperature comes back under the ceiling.

**That reduction in torque is the anti-ice penalty.** It is not that the engine has been damaged or throttled. It is that the ceiling arrived sooner.

> **An analogy.** You are carrying boxes up a staircase, and the rule is you must stop before you are out of breath. Now put a heavy pack on your back. The rule has not changed — you still stop at the same point of breathlessness. But you will get there sooner, so you can carry fewer boxes per trip. The staircase did not change. Your capacity did.

---

## Step 4 — Converting degrees into torque

We need to know how many degrees of TIT one percent of torque is worth.

We already have this. It is sitting in the **power assurance chart**, which relates torque to TIT at any given altitude and temperature. Reading the slope off that chart across every altitude curve, every temperature curve, and both engine sets:

> **1 % torque = 3.0 °C of TIT**

This is remarkably consistent — 216 combinations checked, all between 2.7 and 3.4 °C. The relationship is a straight line on the chart, so the number does not drift depending on where you read it.

Now the arithmetic is simple.

| TIT rise on anti-ice | Torque you must give up |
|---|---|
| 24 °C | 8 % |
| **30 °C — our stated minimum** | **10 %** |
| 36 °C | 12 % |
| **40 °C — what we commonly see** | **13 %** |

---

## Step 5 — The problem with 8 %

Read the top line of that table again.

**A penalty of 8 % corresponds to a TIT rise of 24 °C.**

We do not accept 24 °C. Our own check requires 30 °C minimum to declare the system serviceable. If a crew selected anti-ice and saw only 24 °C of TIT rise, they would write it up as a fault.

So the number we brief describes an anti-ice system performing **below the standard we would accept**. Even a system scraping through at the bare minimum costs 10 %. A normal one costs about 13 %.

---

## Step 6 — There is a second penalty nobody is counting

Anti-ice is not only bleed air. Large parts of the ice protection system are **electrical** — heated main rotor blades, heated tail rotor blades, heated intakes.

Electricity on this aircraft comes from generators mounted on the **main gearbox and the accessory gearbox** — not on the engines. The gearbox is turned by the engines, so every kilowatt of heating is still shaft power that has to come from somewhere.

Adding up the loads on AC MAIN 1 and 2 with the full ice protection suite running comes to roughly **69 kW** — about 39 % of everything the two generators can produce.

Converted into torque, and split across the two engines still running after an engine failure, that is about **3 % torque per engine.**

This one works differently from bleed air, and the distinction is worth stating clearly because it is a fair objection — one raised during this analysis:

- **Bleed air reduces what the engine can produce.** Less air to burn, so less power before the temperature limit. That is a true reduction in engine capability.
- **Electrical load does not.** The engine can still make exactly as much as before. A generator hanging off the gearbox changes nothing about what the engine is capable of.

So why does it appear on a chart of torque *available*?

Because the hover charts tell you the torque needed to turn the **rotor**. They do not include the heaters. That power has to be accounted for somewhere, and the Flight Manual accounts for it by taking it off the available side instead of adding it to the required side.

That is why the charts are titled *Torque Available **to Hover*** — not simply torque available. It is what is left for the rotor once everything else has taken its share. The bookkeeping sits on the available side even though the physics sits on the demand side.

**One useful consequence of the gearbox mounting.** Because the generators are driven by the gearbox rather than by individual engines, the load is shared across whichever engines are still turning. All three running, each carries a third. One engine failed, the two survivors each carry half — so the per-engine penalty is larger after an engine failure, which is precisely when it matters. This also means the electrical penalty scales between the three-engine and one-engine-out cases in exactly the same 2:3 ratio the crew already uses everywhere else in the brief.

---

## Step 7 — Putting the two together

```
Bleed penalty  (36 C TIT rise)      12 %
Electrical ice protection            3 %
                                   ------
Total                               15 %
```

Now compare that against the Flight Manual itself.

Figure 4-61 shows torque available with anti-ice **off**. Figure 4-62 shows torque available with anti-ice **on**. We digitised both charts and compared them at over 900 points across the whole altitude and temperature envelope.

**The gap between them is 15 %.**

Not roughly 15. The difference between the two charts is a near-constant 15.2 %, holding within about 1.5 % everywhere from −45 °C to +40 °C and from sea level to 10,000 ft.

The number we calculated from first principles and the number the Flight Manual actually shows are the same number.

**Nothing is missing.** There is no mystery system, no unexplained load. The penalty is bleed plus heaters, and it comes to 15 %.

---

## Step 8 — What this means operationally

Working an example at 2000 ft and −5 °C:

| Source | Torque available |
|---|---|
| Chart, anti-ice off | 125 % (limited by the gearbox) |
| **What we brief today** (Annex B minus 8) | **121 %** |
| **What Figure 4-62 shows** | **115 %** |

The crew is briefed a number **6 % higher than the Flight Manual supports.** In the equivalent three-engine figures actually spoken in the brief, that is 81 against 77.

Nothing about the briefed number looks wrong. It sits below the transmission limit. It is a plausible figure. There is no flag, no warning, nothing to tell a crew that two official sources disagree.

And this matters most in exactly the wrong place. A crew reaches for the anti-ice penalty when they are going into icing — often at night, often heavy, often over water, and frequently with nowhere good to put the aircraft if an engine quits. That is precisely when believing you have 6 % more than you do is least survivable.

**The error is in the dangerous direction, in the conditions where margin matters most.**

---

## Step 9 — One gap the Flight Manual does not cover

There is a configuration we fly regularly that no chart addresses.

Engine anti-ice is required below 5 °C in visible moisture. But if we are not actually picking up ice, we do not turn on the rotor ice protection. So we fly with **bleed air anti-ice on and the electrical heating off** — routinely.

The Flight Manual has a chart for everything off (4-61) and a chart for everything on (4-62). It has nothing for the middle.

For that configuration the honest answer is: bleed penalty only, no electrical. Somewhere around **10 to 13 %** by the reasoning above, depending on how much TIT rise the system is actually showing that day.

Annex B is currently the only published document that addresses this configuration at all — and its number for it is 8 %, which is still too low.

---

## Summary of the argument

1. Engines are limited by temperature, not by fuel or air.
2. Anti-ice steals air, so the engine runs hotter — we measure 30 to 40 °C hotter, and we require at least 30 to call the system serviceable.
3. The temperature ceiling has not moved, so torque must come down to stay under it.
4. From the power assurance chart, 1 % torque = 3.0 °C.
5. Therefore the bleed penalty is 10 % at our stated minimum and about 13 % in normal service. **8 % corresponds to 24 °C — a system we would reject.**
6. Electrical rotor and intake heating adds a further 3 %.
7. Total 15 % — **which is exactly the gap between Figures 4-61 and 4-62**, measured across the full envelope.
8. We currently brief 8 %. The shortfall is real, it is roughly 7 %, and it is in the direction that overstates the crew's margin.
9. No chart exists for anti-ice on with rotor heating off, which is a configuration we fly routinely.

---

## What is proposed

Nothing yet. This is a technical finding placed in front of standards for a decision.

The performance calculator deliberately reproduces the current hand procedure and will continue to do so. **It will not change its arithmetic ahead of the fleet.** Whatever standards decides is briefed is what the app will compute.

The purpose of this document is to establish that the 8 % figure does not hold up against the Flight Manual's own charts, against the aircraft's measured electrical loads, or against the TIT rise we observe on every anti-ice check — and to put that in front of the people who own the procedure.

---

### Where the numbers came from

| Quantity | Source |
|---|---|
| 1 % torque = 16.6 SHP per engine | AFM Fig 4-5 (94 % Q at 102 % NR = 1560 SHP) |
| 1 % torque = 3.0 °C TIT | Power assurance charts, all four datasets, 216 combinations |
| 30–40 °C TIT rise on anti-ice | Fleet observation and the anti-ice serviceability check |
| 69 kW ice protection load | AC MAIN 1 and 2 bus loading, 2 × 90 kVA generators |
| 15.2 % chart-to-chart gap | Digitisation of AFM Figs 4-61 and 4-62, 570 comparison points |
| Reference values | FE hand traces, treated as ground truth throughout |
