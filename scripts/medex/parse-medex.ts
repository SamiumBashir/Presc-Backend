import * as cheerio from 'cheerio';

export interface IMedexBrandRecord {
  brandName: string | null;
  strength: string | null;
  genericName: string | null;
  manufacturer: string | null;
  dosageForm?: string | null;
  medicineType?: 'Allopathic' | 'Unani' | 'Ayurvedic' | 'Herbal';
  sourcePage: number;
  sourceUrl: string;
  detailUrl?: string | null;
}

/**
 * Decodes common HTML entities and normalizes multiple spaces/newlines
 */
export function cleanText(raw?: string | null): string | null {
  if (!raw) return null;
  const decoded = raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Parses a single MedEx brands HTML page and extracts all medicine brand cards
 */
export function parseMedexHtml(html: string, pageNum: number): IMedexBrandRecord[] {
  if (!html || typeof html !== 'string') return [];

  const $ = cheerio.load(html);
  const records: IMedexBrandRecord[] = [];

  $('.brand-card').each((_, elem) => {
    const $card = $(elem);

    // 1. Detail link
    const href = $card.attr('href') || null;
    const detailUrl = href
      ? href.startsWith('http')
        ? href
        : `https://medex.com.bd${href.startsWith('/') ? '' : '/'}${href}`
      : null;

    // 2. Brand Name
    const rawBrandName = $card.find('.brand-card__name').text();
    const brandName = cleanText(rawBrandName);

    // 3. Strength
    const rawStrength = $card.find('.brand-card__strength').text();
    const strength = cleanText(rawStrength);

    // 4. Generic Name
    const rawGeneric = $card.find('.brand-card__generic').text();
    const genericName = cleanText(rawGeneric);

    // 5. Manufacturer
    const rawCompany = $card.find('.brand-card__company').text();
    const manufacturer = cleanText(rawCompany);

    // 6. Dosage Form (from dosage-icon image alt/title or slug fallback)
    const $dosageImg = $card.find('.dosage-icon, .brand-card__name-row img');
    let rawDosageForm = $dosageImg.attr('alt') || $dosageImg.attr('title') || null;
    
    // Fallback: extract dosage form from end of detailUrl slug if not on icon
    if (!rawDosageForm && href) {
      const parts = href.split('/');
      const slug = parts[parts.length - 1] || '';
      const slugParts = slug.split('-');
      if (slugParts.length > 0) {
        const lastWord = slugParts[slugParts.length - 1];
        if (['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'drop', 'cream', 'ointment', 'gel', 'inhaler'].includes(lastWord.toLowerCase())) {
          rawDosageForm = lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
        }
      }
    }
    const dosageForm = cleanText(rawDosageForm);

    if (brandName) {
      records.push({
        brandName,
        strength: strength || null,
        genericName: genericName || null,
        manufacturer: manufacturer || null,
        dosageForm: dosageForm || 'Tablet',
        sourcePage: pageNum,
        sourceUrl: `https://medex.com.bd/brands?page=${pageNum}`,
        detailUrl,
      });
    }
  });

  return records;
}

/**
 * High-precision domain classifier for Bangladesh national traditional medicines
 * Categorizes a medicine record into 'Unani', 'Ayurvedic', or 'Herbal'
 */
export function classifyMedicineRecord(record: {
  brandName?: string | null;
  genericName?: string | null;
  manufacturer?: string | null;
  dosageForm?: string | null;
}): 'Unani' | 'Ayurvedic' | 'Herbal' {
  const comp = (record.manufacturer || '').toLowerCase().trim();
  const gen = (record.genericName || '').toLowerCase().trim();
  const name = (record.brandName || '').toLowerCase().trim();

  // 1. Explicit manufacturer indicators
  if (comp.includes('(unani)') || comp.includes('hamdard')) {
    return 'Unani';
  }
  if (
    comp.includes('(ayurvedic)') ||
    comp.includes('ayurvedic') ||
    comp.includes('dabur') ||
    comp.includes('sadhana') ||
    comp.includes('kundeswari') ||
    comp.includes('kundu deshiya')
  ) {
    return 'Ayurvedic';
  }

  // 2. Unani traditional formulations, dosage forms & pharmacopoeial names
  const isUnaniGeneric =
    gen.includes('habb') ||
    name.includes('habb') ||
    gen.includes('qurs') ||
    name.includes('qurs') ||
    gen.includes('sharbat') ||
    name.includes('sharbat') ||
    gen.includes('arq ') ||
    gen.startsWith('arq') ||
    gen.includes('jowarish') ||
    gen.includes('jowrish') ||
    gen.includes('majun') ||
    gen.includes('majoon') ||
    name.includes('majoon') ||
    gen.includes('lubub') ||
    name.includes('lubub') ||
    gen.includes('etrifal') ||
    gen.includes('itrifal') ||
    name.includes('etrifal') ||
    gen.includes('sufoof') ||
    gen.includes('sufuf') ||
    gen.includes('marham') ||
    name.includes('marham') ||
    gen.includes('rowghan') ||
    gen.includes('tila') ||
    name.includes('tila') ||
    gen.includes('kusta') ||
    gen.includes('qushta') ||
    gen.includes('lauq') ||
    gen.includes('khamira') ||
    gen.includes('unani') ||
    gen.includes('ambar momiyaee') ||
    gen.includes('tabkheer') ||
    gen.includes('garlitab') ||
    gen.includes('barsina') ||
    gen.includes('dinar') ||
    gen.includes('ejaz') ||
    gen.includes('espand') ||
    gen.includes('fishar') ||
    gen.includes('hazmina') ||
    gen.includes('kabid naushadri') ||
    gen.includes('kabid nawshadri') ||
    gen.includes('khakshi') ||
    gen.includes('marwareedi') ||
    gen.includes('mudir') ||
    gen.includes('mumshik') ||
    gen.includes('munish') ||
    gen.includes('pechish') ||
    gen.includes('penitab') ||
    gen.includes('rehmin') ||
    gen.includes('salajeet') ||
    gen.includes('sanoon babla') ||
    gen.includes('suzark') ||
    gen.includes('aab-e hayat') ||
    gen.includes('awjayee') ||
    gen.includes('bandish') ||
    gen.includes('hayateen murakkab') ||
    gen.includes('almond + coconut + edible pine + salep') ||
    gen.includes('salep + coconut + poppy seeds + almond') ||
    gen.includes('convolvulus scammonia + colchicum luteum') ||
    gen.includes('saffron + mace arillus + nutmeg fruit') ||
    gen.includes('saffron + sand lizard + nutmeg fruit') ||
    gen.includes('white damar + acacia + bole rubra') ||
    gen.includes('acacia + dates + asparagus + edible pine') ||
    gen.includes('aloe indica+ hyoscyamus niger + piper nigrum') ||
    gen.includes('aloe ferox + foeniculi fructus') ||
    gen.includes('aloe + black pepper + henbane') ||
    gen.includes('lavandula stoechas + coriandrum sativum + piper nigrum') ||
    gen.includes('foeniculum vulgare + papaver somniferum + terminalia chebula') ||
    gen.includes('aniseed + indian dill + black cardamom + peppermint') ||
    gen.includes('date palm + betel nut + acacia') ||
    gen.includes('datura + rhubarb + ginger') ||
    gen.includes('glycyrrhiza glabra + cochiospermum religiosum') ||
    gen.includes('sana + revand chini + neem + chirata + tulsi') ||
    gen.includes('fennel [mouri, gohkshura, kasni]') ||
    gen.includes('humuzin');

  if (isUnaniGeneric) return 'Unani';

  // 3. Ayurvedic traditional formulations, dosage forms & pharmacopoeial names
  const isAyurvedicGeneric =
    gen.includes('arista') ||
    gen.includes('arishta') ||
    gen.includes('arist') ||
    gen.includes('asav') ||
    gen.includes('asava') ||
    gen.includes('kwath') ||
    gen.includes('churna') ||
    gen.includes('rasayan') ||
    gen.includes('rasayana') ||
    gen.includes('roshayan') ||
    gen.includes('guggulu') ||
    gen.includes('guggul') ||
    gen.includes('louha') ||
    gen.includes('modak') ||
    gen.includes('sandhan') ||
    gen.includes('arka') ||
    gen.includes('avaleha') ||
    gen.includes('bhasma') ||
    gen.includes('ghrita') ||
    gen.includes('bati') ||
    gen.includes('vati') ||
    gen.includes('ayurvedic') ||
    gen.includes('vasakarista') ||
    gen.includes('chyabanprash') ||
    name.includes('chyabanprash') ||
    gen.includes('emblic myrobalan + aswagandha + grape') ||
    gen.includes('emblic myrobalan + chebulic + belleric') ||
    gen.includes('vaskar laban') ||
    gen.includes('jouban satadal') ||
    gen.includes('belgiri') ||
    gen.includes('chebulic myrobalan + barberry') ||
    gen.includes('devil’s cotton + ashoka bark + aswagandha') ||
    gen.includes('chlorophytum arundinaceum + curculigo orchioides') ||
    gen.includes('asparagus racemosus + tamarindus indica') ||
    gen.includes('shatamul') ||
    gen.includes('shatavari') ||
    gen.includes('gohkshura') ||
    gen.includes('ishobgul, senna, haritaki, sonali, josthimodhu, mouri') ||
    gen.includes('fennel, fenugreek, cumin, aniseed, cumin & dill powder') ||
    gen.includes('phyllanthus + terminalia + foeniculum + terminalia') ||
    gen.includes('phyllanthus emblica + bambusa bambos') ||
    gen.includes('nux-vomica + black pepper + long pepper') ||
    gen.includes('sida cordifolia + withania somnifera');

  if (isAyurvedicGeneric) return 'Ayurvedic';

  // 4. Default to Herbal (Western plant extract, nutraceutical, dietary supplement)
  return 'Herbal';
}

