// Bookmarklet entry. Use a cache-busting query so each click re-runs this file while main.js stays cached:
//   javascript:import('http://localhost:5173/shells/injected/loader.js?'+Date.now())
import { toggle } from '../../src/main.js';
import { createInjectedPlatform } from '../../src/platform/injected.js';

toggle(createInjectedPlatform());
