#!/usr/bin/env python

import argparse
import googlemaps
from multiprocessing import Pool
from simple_salesforce import Salesforce

# Ensure `sf_keys.py` exists in the current directory, and in it populate
# the below variables with appropriate values before running this script
from sf_keys import USERNAME, PASSWORD, SECURITY_TOKEN
"""
Library which takes a list of addresses and returns a map from address to geocoordinates,
by sending lookup requests to the Google Maps API.
"""

# A GCP API key for the "Geocoding API" (maps-apis/apis/geocoding-backend.googleapis.com).
API_KEY = ''


def __get_args():
  parser = argparse.ArgumentParser(
      description='Download specific images from Salesforce')
  parser.add_argument(
      '-o',
      '--output-dir',
      type=str,
      dest='outdir',
      required=False,
      default='.',
      help='output directory for images (default: current dir)')
  parser.add_argument(
      '-l',
      '--limit',
      type=int,
      dest='limit',
      required=False,
      default='0',
      help='max number of records to update per invocation (default: no limit)')
  parser.add_argument(
      '-p',
      '--pool_size',
      type=int,
      dest='pool_size',
      required=False,
      default='25',
      help='pool size -- max number of requests to send simultaneously')
  args = parser.parse_args()
  return args


def __geocode(address):
  """Send an RPC to the Google Geocoding API, return the single most-confident

  result, or None if there is no parse.
  The googlemaps client library should handle retries appropriately.
  Median latency is around 500ms.
  Note that there is a 50 QPS ratelimit on this API.
  """
  gmaps = googlemaps.Client(key=API_KEY)
  result = gmaps.geocode(address)
  if len(result) == 0:
    print('Unable to geocode address: ' + address)
    return None
  return result[0]


def __get_coords_for_address(address):
  """Returns a tuple of (lat, long) for the given address, or () if the address

  could not be geocoded.
  """
  response_map = __geocode(address)
  if not response_map:
    return (0, 0)
  return (response_map['geometry']['location']['lat'],
          response_map['geometry']['location']['lng'])


def get_coords_for_addresses(addresses, pool_size):
  """Returns a map from address to (lat, long) pair.

  Expected throughput of 50 addresses/second.
  """
  with Pool(pool_size) as p:
    coords = p.map(__get_coords_for_address, addresses)
    return dict(zip(addresses, coords))


def geocode_USDPSD_addresses(limit, pool_size):
  """Fetch a list of un-coded addresses from SF, geocode them, write to SF."""
  sf = Salesforce(
      username=USERNAME, password=PASSWORD, security_token=SECURITY_TOKEN)

  # results = sf.query_all(
  #     "SELECT Full_Residency_Address__c \
  #     FROM US_Disaster_Project_Specific_Data__c \
  #     WHERE Full_Residency_Address__c != null \
  #     AND Residency_Addr_GPS_Coordinates__Latitude__s = null \
  #     ")
  # print("num results:", len(results['records']))
  # for r in results['records']:
  #     if r['Full_Residency_Address__c'] == None:
  #         print(r)
  # exit(1)

  # Note: really, this should include `WHERE Full_Residency_Address__c != null`
  # in the WHERE clause. However, that doesn't seem to do anything, for
  # reasons that escape me. Therefore, we'll do that filtering in python...
  where_clause = 'WHERE Residency_Addr_GPS_Coordinates__Latitude__s = null'
  results = sf.query_all(
      'SELECT Id, Full_Residency_Address__c FROM US_Disaster_Project_Specific_Data__c {}'
      .format(where_clause))
  id_to_address = {}
  cnt = 0
  for r in results['records']:
    if limit and cnt == limit:
      break
    if r['Full_Residency_Address__c'] != None:
      id_to_address[r['Id']] = r['Full_Residency_Address__c']
      cnt += 1
  print(id_to_address)

  address_to_coords = get_coords_for_addresses(id_to_address.values(),
                                               pool_size)

  update_to_send = []
  for recipient_id, address in id_to_address.items():
    coords = address_to_coords[address]
    data = {}
    data['Id'] = recipient_id
    data['Residency_Addr_GPS_Coordinates__Latitude__s'] = coords[0]
    data['Residency_Addr_GPS_Coordinates__Longitude__s'] = coords[1]
    update_to_send.append(data)

  print('sending update: ', update_to_send)
  sf.bulk.US_Disaster_Project_Specific_Data__c.update(update_to_send)


if __name__ == '__main__':
  args = __get_args()
  geocode_USDPSD_addresses(args.limit, args.pool_size)

  # print(get_coords_for_addresses(
  #     ['1600 pennslyvania ave', '1600 Amphitheatre Parkway mountain view']))
