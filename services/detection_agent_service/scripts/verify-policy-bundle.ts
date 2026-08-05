import { loadPolicyBundle, verifyPolicyBundle } from "../src/policy-bundle.js";

const result = verifyPolicyBundle(loadPolicyBundle());
console.log(JSON.stringify({ ...result, productionSwapAuthorized: false, automaticPolicyMutation: false }, null, 2));
