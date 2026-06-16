import os
import ssl
import time
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup

app = Flask(__name__)

# Cache configuration
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
cache = {
    "data": None,
    "last_updated": 0
}
CACHE_DURATION = 600  # 10 minutes cache duration

def parse_feed_content(xml_data):
    """
    Parses the Atom XML feed and extracts individual updates,
    splitting entries with multiple updates by h3 tag.
    """
    namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
    root = ET.fromstring(xml_data)
    
    updates = []
    
    for entry in root.findall('atom:entry', namespaces):
        title = entry.find('atom:title', namespaces).text or "Unknown Date"
        updated = entry.find('atom:updated', namespaces).text or ""
        
        # Link to specific anchor if available
        link_elem = entry.find('atom:link', namespaces)
        link = link_elem.attrib.get('href') if link_elem is not None else ""
        
        content_elem = entry.find('atom:content', namespaces)
        content_html = content_elem.text if content_elem is not None else ""
        
        if not content_html:
            continue
            
        soup = BeautifulSoup(content_html, 'html.parser')
        
        # Split content by h3 headers to get individual updates
        current_type = "Update"
        current_content = []
        
        # Helper to push a parsed update
        def add_update(update_type, contents):
            html_text = "".join(str(c) for c in contents).strip()
            if not html_text:
                return
            
            # Extract plain text for search and tweet preview
            raw_text = BeautifulSoup(html_text, 'html.parser').get_text().strip()
            
            # Standardize update types (e.g. Feature, Issue, Deprecation, Announcement)
            clean_type = update_type.replace("###", "").strip()
            if not clean_type:
                clean_type = "General"
                
            updates.append({
                'date': title,
                'updated': updated,
                'link': link,
                'type': clean_type,
                'content': html_text,
                'raw_text': raw_text
            })

        for child in soup.contents:
            if child.name == 'h3':
                # Save previous update if there's any content
                if current_content:
                    add_update(current_type, current_content)
                    current_content = []
                current_type = child.get_text().strip()
            elif child.name is not None:
                current_content.append(child)
                
        # Append the final chunk
        if current_content or current_type != "Update":
            add_update(current_type, current_content)
            
    return updates

def fetch_release_notes(force_refresh=False):
    """
    Fetches the feed, uses cache if fresh and force_refresh is False.
    """
    now = time.time()
    if not force_refresh and cache["data"] is not None and (now - cache["last_updated"]) < CACHE_DURATION:
        return cache["data"], "cache"
        
    try:
        context = ssl._create_unverified_context()
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BigQueryReleaseNotesNotifier/1.0'}
        )
        with urllib.request.urlopen(req, context=context) as response:
            xml_data = response.read()
            
        updates = parse_feed_content(xml_data)
        
        # Update cache
        cache["data"] = updates
        cache["last_updated"] = now
        return updates, "network"
    except Exception as e:
        # Fallback to cache if network request fails
        if cache["data"] is not None:
            return cache["data"], "network_failure_fallback_cache"
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('force', 'false').lower() == 'true'
    try:
        releases, source = fetch_release_notes(force_refresh=force_refresh)
        return jsonify({
            'success': True,
            'source': source,
            'count': len(releases),
            'releases': releases
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Run on port 8080 by default
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
