(function () {
  const synth = window.speechSynthesis;
  let lastUtterance = null;
  let lastText = "";
  let lastLang = "zh-CN";

  function unsupportedMessage(lang) {
    return lang === "en-US"
      ? "This browser does not support the Web Speech API."
      : "当前浏览器不支持 Web Speech API。";
  }

  function speak(text, lang) {
    if (!("speechSynthesis" in window)) {
      window.alert(unsupportedMessage(lang));
      return;
    }

    lastText = text;
    lastLang = lang || "zh-CN";
    synth.cancel();

    lastUtterance = new SpeechSynthesisUtterance(text);
    lastUtterance.lang = lastLang;
    lastUtterance.rate = lastLang.startsWith("zh") ? 0.86 : 0.9;
    lastUtterance.pitch = 1;
    synth.speak(lastUtterance);
  }

  function pause() {
    if ("speechSynthesis" in window && synth.speaking && !synth.paused) {
      synth.pause();
      return;
    }

    if ("speechSynthesis" in window && synth.paused) {
      synth.resume();
    }
  }

  function repeat() {
    if (lastText) {
      speak(lastText, lastLang);
    }
  }

  function stop() {
    if ("speechSynthesis" in window) {
      synth.cancel();
    }
  }

  window.TotemSpeech = {
    speak,
    pause,
    repeat,
    stop,
  };
})();
