
import requests
import pandas as pd
import time

def fetch_indicator(indicator_code, friendly_name):
    """
    Fetches a single indicator for all countries from World Bank API.
    Handles pagination.
    """
    url = f"http://api.worldbank.org/v2/country/all/indicator/{indicator_code}"
    params = {
        "format": "json",
        "per_page": 20000, # Try to get everything in one or few pages
        "date": "1960:2025"
    }
    
    print(f"Fetching {friendly_name} ({indicator_code})...")
    
    all_data = []
    page = 1
    
    while True:
        params['page'] = page
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if not data or len(data) < 2:
                break
                
            # The actual data is in the second element of the list
            records = data[1]
            if not records:
                break
                
            all_data.extend(records)
            
            # Check pagination info
            page_info = data[0]
            if page >= page_info['pages']:
                break
                
            page += 1
            time.sleep(0.5) # Be nice to the API
            
        except Exception as e:
            print(f"Error fetching {indicator_code}: {e}")
            break
            
    # Process list into specific format: values only
    processed_data = []
    for item in all_data:
        # item structure: {'indicator': ..., 'country': {'id': 'ZH', 'value': '...'}, 'value': ..., 'date': ...}
        val = item.get('value')
        year = item.get('date')
        country = item.get('country', {}).get('value')
        
        if country and year:
            processed_data.append({
                'Country': country,
                'Year': int(year),
                month_year_col_name(friendly_name): val
            })
            
    return pd.DataFrame(processed_data)

def month_year_col_name(name):
    return name

def fetch_world_bank_data():
    # 1. Define Indicators
    indicators = {
        # Economy
        'NY.GDP.MKTP.CD': 'GDP (Current US$)',
        'NY.GDP.MKTP.KD.ZG': 'GDP Growth (Annual %)',
        'NY.GDP.PCAP.CD': 'GDP Per Capita (Current US$)',
        'FP.CPI.TOTL.ZG': 'Inflation (CPI %)',
        'NE.TRD.GNFS.ZS': 'Trade (% of GDP)',
        'BX.KLT.DINV.WD.GD.ZS': 'FDI Net Inflows (% of GDP)',

        # Society & Inequality
        'SI.POV.GINI': 'Gini Index',
        'SL.UEM.TOTL.ZS': 'Unemployment Rate (% total)',
        'SI.POV.DDAY': 'Poverty Headcount Ratio ($2.15 a day)',

        # Demographics & Health
        'SP.POP.TOTL': 'Population Total',
        'SP.DYN.LE00.IN': 'Life Expectancy at Birth',
        'SP.DYN.TFRT.IN': 'Fertility Rate',
        'SP.URB.TOTL.IN.ZS': 'Urban Population (% of Total)',

        # Education & Innovation
        'SE.ADT.LITR.ZS': 'Literacy Rate (Adult %)',
        'GB.XPD.RSDV.GD.ZS': 'R&D Expenditure (% of GDP)',

        # Governance & Conflict Proxies
        'MS.MIL.XPND.GD.ZS': 'Military Expenditure (% of GDP)',
        'VC.IHR.PSRC.P5': 'Intentional Homicides (per 100k)'
    }

    # DataFrame to merge into
    # Initialize with a base structure or merge iteratively
    final_df = None
    
    for code, name in indicators.items():
        df_indicator = fetch_indicator(code, name)
        
        # Rename the 'value' column to the indicator name handled in fetch_indicator
        # actually fetch_indicator returns a DF with Country, Year, Name.
        
        if final_df is None:
            final_df = df_indicator
        else:
            final_df = pd.merge(final_df, df_indicator, on=['Country', 'Year'], how='outer')
            
    # Clean up
    if final_df is not None:
        final_df.sort_values(by=['Country', 'Year'], inplace=True)
        print(f"Data fetched successfully! Shape: {final_df.shape}")
        print("Sample:\n", final_df.head())
        
    return final_df

def save_data(df, filename='Datasets/world_data.csv'):
    if df is not None:
        print(f"Saving data to {filename}...")
        df.to_csv(filename, index=False)
        print("Done.")
    else:
        print("No data frame to save.")

if __name__ == "__main__":
    df = fetch_world_bank_data()
    save_data(df)
