import './env';
import { createQueryPlan } from "../lib/query-planner";

async function main() {
  const plan = await createQueryPlan(
    "React 的 useState 和 useEffect 有什么区别？分别适用于什么场景？使用时有哪些常见问题？",
  );

  console.dir(plan, { depth: null });
}

main().catch(console.error);