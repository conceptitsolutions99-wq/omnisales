import urllib.request
import urllib.parse
import json

def fetch_real_leads():
    # Wikidata SPARQL query for real companies in USA and Canada
    sparql_query = """
    SELECT ?companyLabel ?countryLabel WHERE {
      ?company wdt:P31 wd:Q4830473;
               wdt:P17 ?country.
      FILTER(?country = wd:Q30 || ?country = wd:Q16)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 20
    """
    url = 'https://query.wikidata.org/sparql?query=' + urllib.parse.quote(sparql_query) + '&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'OmniSalesOutboundSystem/1.0 (contact@omnisales.io)'})

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            leads = []
            for item in data.get('results', {}).get('bindings', []):
                name = item.get('companyLabel', {}).get('value')
                country = item.get('countryLabel', {}).get('value')
                if name and not name.startswith('Q'):
                    leads.append({'company': name, 'country': country})
            return leads
    except Exception as e:
        print("Error fetching real leads:", e)
        return []

if __name__ == '__main__':
    print(fetch_real_leads())
