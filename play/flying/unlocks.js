"use strict";
(() => {
  const rules = {
    trainer:["mathLevel",1], scout:["mathLevel",3], biplane:["mathLevel",6], twin:["mathLevel",9],
    island:["correctTotal",0], tuscany:["correctTotal",15], balloon:["correctTotal",30],
    sedona:["correctTotal",45], atoll:["correctTotal",60], lake:["correctTotal",75],
    headland:["correctTotal",90], caldera:["correctTotal",105], fjord:["correctTotal",120], canyon:["correctTotal",135]
  };
  function isUnlocked(item, progress, learningMode) {
    if (!learningMode) return true;
    if (!Object.hasOwn(rules,item)) return false;
    const [key, threshold] = rules[item];
    const value = key === "mathLevel" ? Math.max(progress.mathLevel ?? 1, progress.highestMathLevel ?? 1)
      : progress.correctTotal ?? 0;
    return value >= threshold;
  }
  Object.assign(window.CapeFlight,{unlockRules:rules,isUnlocked});
})();
