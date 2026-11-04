"use client";

import { motion } from "framer-motion";
import { Disclosure } from "@/components/ui/Disclosure";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Rise } from "@/components/ui/Rise";
import { TABLES } from "@/lib/data/tables";
import { useSetup } from "@/lib/store/setup";
import { BalanceChip } from "./BalanceChip";
import { TableCard } from "./TableCard";

export function LobbyView() {
  const { selectTable } = useSetup();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pt-6 lg:px-10 lg:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <MonoLabel tracking="wide">02 · Pick a seat</MonoLabel>
          <BalanceChip />
        </div>
        <Rise
          as="h1"
          feel="spring"
          distance={24}
          className="display text-[104px] leading-[0.8] tracking-[-0.07em] lg:text-[160px]"
        >
          tables
        </Rise>
      </header>

      <Disclosure
        summary="New to poker stakes?"
        className="border-y border-hair py-1.5"
        summaryClassName="text-[14px] font-medium"
      >
        <dl className="flex flex-col gap-2.5 pb-2 text-[14px] leading-[1.45]">
          <div>
            <dt className="inline font-semibold">Blinds 0.5 / 1</dt>
            <dd className="inline text-muted">
              {" "}
              — two small forced bets that start every hand, so there&rsquo;s always a pot.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold">Buy-in</dt>
            <dd className="inline text-muted">
              {" "}
              — what your agent brings to the table. It can only lose what it brings.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold">Practice vs real money</dt>
            <dd className="inline text-muted">
              {" "}
              — practice tables use free chips. Real-money tables always ask you to confirm first.
            </dd>
          </div>
        </dl>
      </Disclosure>

      <motion.ul
        className="grid gap-6 md:grid-cols-2 md:items-start"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } }}
      >
        {TABLES.map((t) => (
          <motion.li
            key={t.id}
            variants={{
              hidden: { opacity: 0, y: 24 },
              show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] } },
            }}
          >
            <TableCard table={t} onSelect={selectTable} />
          </motion.li>
        ))}
      </motion.ul>
    </main>
  );
}
