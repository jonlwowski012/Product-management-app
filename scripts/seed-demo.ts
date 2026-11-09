import "dotenv/config";
import { seedDemo } from "../lib/demo-seed";
console.log(JSON.stringify(await seedDemo()));
