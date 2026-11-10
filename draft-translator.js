const models = 'https://huggingface.co/midudev/firefox-translations/resolve/6f6acd72c26975a06a8e61b72d1fbacbd184c23f/';

export async function createDraftTranslator({sourceLanguage, targetLanguage, signal}, onFallback) {
  const native = globalThis.Translator;
  if (native) {
    try {
      const options = {sourceLanguage, targetLanguage};
      if (await native.availability(options) !== 'unavailable') {
        return await native.create({...options, signal});
      }
    } catch {
      signal.throwIfAborted();
    }
  }

  signal.throwIfAborted();
  onFallback();
  const {BergamotEngine} = await import('./vendor/bergamot.js');
  signal.throwIfAborted();
  const engine = new BergamotEngine({modelPath: models});
  const dispose = () => engine.dispose();
  let rejectAbort;
  const aborted = new Promise((_,reject) => { rejectAbort = reject; });
  const cancel = () => {
    dispose();
    rejectAbort(signal.reason);
  };
  signal.addEventListener('abort',cancel,{once:true});
  try {
    await Promise.race([engine.load(sourceLanguage,targetLanguage),aborted]);
    signal.throwIfAborted();
  } catch (error) {
    dispose();
    throw error;
  } finally {
    signal.removeEventListener('abort',cancel);
  }
  signal.addEventListener('abort',dispose,{once:true});
  return {
    async translate(text) {
      const [result] = await engine.translate(sourceLanguage, targetLanguage, [text]);
      return result;
    },
    destroy() {
      signal.removeEventListener('abort',dispose);
      dispose();
    }
  };
}
