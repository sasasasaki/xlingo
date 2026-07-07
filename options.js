const $ = (id) => document.getElementById(id);
chrome.storage.local.get({ keys: {}, order: ['deepseek','grok','gemini'], glossary: '', styleJa: '', styleEn: '' }, (d) => {
  $('k-deepseek').value = d.keys.deepseek || '';
  $('k-grok').value = d.keys.grok || '';
  $('k-gemini').value = d.keys.gemini || '';
  $('order').value = d.order.join(',');
  $('glossary').value = d.glossary;
  $('styleJa').value = d.styleJa;
  $('styleEn').value = d.styleEn;
});
$('save').onclick = () => {
  chrome.storage.local.set({
    keys: { deepseek: $('k-deepseek').value.trim(), grok: $('k-grok').value.trim(), gemini: $('k-gemini').value.trim() },
    order: $('order').value.split(','),
    glossary: $('glossary').value,
    styleJa: $('styleJa').value,
    styleEn: $('styleEn').value,
  }, () => { $('saved').textContent = '✓ 保存した'; setTimeout(() => $('saved').textContent = '', 1500); });
};
