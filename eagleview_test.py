import os
import requests
from dotenv import load_dotenv

# 1. Load your keys
load_dotenv()

CLIENT_ID = os.getenv("EAGLEVIEW_CLIENT_ID")
CLIENT_SECRET = os.getenv("EAGLEVIEW_CLIENT_SECRET")

print("--- EagleView Connection Fix ---")

# CORRECT ENDPOINT
AUTH_URL = "https://apicenter.eagleview.com/oauth2/v1/token"

# CORRECT SCOPE (Must be a URL)
# We request read/write access to orders
SCOPE = "https://api.eagleview.com/orders/read https://api.eagleview.com/orders/write"

payload = {
    "grant_type": "client_credentials",
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "scope": SCOPE
}

print(f"Targeting: {AUTH_URL}")
print(f"Using Scope: {SCOPE}")

try:
    response = requests.post(AUTH_URL, data=payload, timeout=10)
    
    if response.status_code == 200:
        print("\n[SUCCESS] Connection Established!")
        data = response.json()
        print(f"Token Received: {data.get('access_token')[:15]}...")
        print("Scope Granted: " + str(data.get("scope")))
    else:
        print(f"\n[FAILED] Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        # If the above fails, try REMOVING the scope entirely (Strategy B)
        if "invalid_scope" in response.text:
            print("\n[RETRYING] Attempting without 'scope' parameter (Server Default)...")
            del payload["scope"]
            retry = requests.post(AUTH_URL, data=payload, timeout=10)
            if retry.status_code == 200:
                print("\n[SUCCESS] Connection Established (No Scope)!")
                print(f"Token Received: {retry.json().get('access_token')[:15]}...")
            else:
                print(f"[FAILED AGAIN] Status: {retry.status_code}")
                print(retry.text)

except Exception as e:
    print(f"[ERROR] {str(e)}")