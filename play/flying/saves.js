"use strict";

window.CapeFlight.openSaves = async function () {
  const native = window.webkit?.messageHandlers?.flightSave;
  // The standalone website uses IndexedDB. The app sends every save to the native store.
  const db = native || !window.indexedDB ? null : await new Promise(resolve => {
    try {
      const open = window.indexedDB.open("BrainDrainFlying", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("records");
      open.onsuccess = () => resolve(open.result);
      open.onerror = open.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });

  function browserRecord(key, update) {
    if (!db) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const transaction = db.transaction("records", update ? "readwrite" : "readonly");
        const records = transaction.objectStore("records");
        const read = records.get(key);
        let result;
        read.onsuccess = () => {
          result = read.result;
          if (update) {
            result = update(result);
            records.put(result, key);
          }
        };
        transaction.oncomplete = () => resolve(result ?? null);
        transaction.onabort = transaction.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  function empty() { return {schoolCleared:0, fogBest:{}, learningMode:true, parentNoticeSeen:false,
    mathProgress:{level:1,recent:[]}, highestMathLevel:1, correctTotal:0, biometricUnlock:false}; }

  async function post(message) {
    if (native) {
      try { return await native.postMessage(message); } catch { return null; }
    }
    if (message.action === "get") return browserRecord("flight");
    return browserRecord("flight", prior => {
      const record = {...empty(),...prior};
      const {key, value} = message;
      if (key === "schoolCleared" && value === record.schoolCleared + 1) record.schoolCleared = value;
      if (["learningMode","parentNoticeSeen","biometricUnlock"].includes(key) && typeof value==="boolean") record[key]=value;
      // Same rule as the native store: { level 1–10, recent: up to 10 booleans }, one level at a time.
      if (key==="mathProgress" && value && Object.keys(value).length===2 && Number.isInteger(value.level) &&
          value.level>=1 && value.level<=10 && Math.abs(value.level-(record.mathProgress?.level ?? 1))<=1 &&
          Array.isArray(value.recent) && value.recent.length<=10 && value.recent.every(v=>typeof v==="boolean")) {
        record.mathProgress={level:value.level,recent:value.recent};
        record.highestMathLevel=Math.max(record.highestMathLevel,value.level);
      }
      if (key==="correctTotal" && Number.isSafeInteger(value) && value>=0) record.correctTotal=Math.max(record.correctTotal,value);
      if (key === "settings") record.settings = value;
      if (key === "dailyBest" && (!record.dailyBest || value.day > record.dailyBest.day ||
          (value.day === record.dailyBest.day && value.score > record.dailyBest.score))) record.dailyBest = value;
      if (key === "fogBest") record.fogBest[value.course] = Math.max(record.fogBest[value.course] ?? 0, value.score);
      return record;
    });
  }

  return {
    initial: await post({action:"get"}) || empty(),
    set: (key, value) => post({action:"set", key, value}),
    readWebsiteGhost: course => browserRecord("ghost."+course),
    saveWebsiteGhost: (course, run) => browserRecord("ghost."+course, old => old && old.time <= run.time ? old : run)
  };
};
