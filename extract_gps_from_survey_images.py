#!/usr/bin/env python

import argparse
import os
import shutil
import urllib.parse

from functools import partial
from multiprocessing import Pool
from retry import retry
from simple_salesforce import Salesforce
from PIL import Image, ExifTags
"""
Library which downloads image files for a survey, extracts the GPS coords
from the EXIF data, and uploads them to SalesForce.

Images are downloaded by a threadpool, with a default size of 25 downloads
simultaneously. Images that are unable to be downloaded or opened are
skipped in the initial version of this tool, and will not be retried
subsequently.

Known limitations:
 * The WHERE clause in the query basically considers a survey as
   'processed' or 'not processed' - i.e. in the event of partial success,
   where we fail to handle an image, it will consider the record handled,
   and we just won't have coordinates for some of the records.
"""

# Ensure `sf_keys.py` exists in the current directory, and in it populate
# the below variables with appropriate values before running this script
from sf_keys import USERNAME, PASSWORD, SECURITY_TOKEN

IMAGE_FIELDS = {
    "House": "Image_House__c",
    "Token": "Image_Token__c",
    "Recipient": "Image_Recipient__c",
}
COORDS_FIELDS = {
    "House": ("Image_House_GPS_Coordinates__Latitude__s",
              "Image_House_GPS_Coordinates__Longitude__s"),
    "Token": ("Image_Token_GPS_Coordinates__Latitude__s",
              "Image_Token_GPS_Coordinates__Longitude__s"),
    "Recipient": ("Image_Recipient_GPS_Coordinates__Latitude__s",
                  "Image_Recipient_GPS_Coordinates__Longitude__s"),
}

SF_ATTACH_BUFFER = 1048576


def __get_args():
  parser = argparse.ArgumentParser(
      description="Download specific images from Salesforce")
  parser.add_argument(
      "-o",
      "--output-dir",
      type=str,
      dest="outdir",
      required=False,
      default="/tmp/surveyImages/",
      help="output directory for images (default: a folder in /tmp)")
  parser.add_argument(
      "-l",
      "--limit",
      type=int,
      dest="limit",
      required=False,
      default="0",
      help="max number of records to update per invocation (default: no limit)")
  parser.add_argument(
      "-p",
      "--pool_size",
      type=int,
      dest="pool_size",
      required=False,
      default="25",
      help="pool size -- max number of requests to send simultaneously")
  args = parser.parse_args()
  return args


# From https://gist.github.com/maxbellec/dbb60d136565e3c4b805931f5aad2c6d
get_float = lambda x: float(x[0]) / float(x[1])


def __convert_to_degrees(value):
  """From https://gist.github.com/maxbellec/dbb60d136565e3c4b805931f5aad2c6d."""
  d = get_float(value[0])
  m = get_float(value[1])
  s = get_float(value[2])
  return d + (m / 60.0) + (s / 3600.0)


# From https://gist.github.com/maxbellec/dbb60d136565e3c4b805931f5aad2c6d
def __get_lat_lon(info):
  """From https://gist.github.com/maxbellec/dbb60d136565e3c4b805931f5aad2c6d."""
  try:
    gps_latitude = info[34853][2]
    gps_latitude_ref = info[34853][1]
    gps_longitude = info[34853][4]
    gps_longitude_ref = info[34853][3]
    lat = __convert_to_degrees(gps_latitude)
    if gps_latitude_ref != "N":
      lat *= -1

    lon = __convert_to_degrees(gps_longitude)
    if gps_longitude_ref != "E":
      lon *= -1
    return "%.6f" % (lat), "%.6f" % (lon)
  except KeyError:
    return None


def __get_coords_from_file(filepath):
  """Return a decimal representation of the lat/long for an image."""
  try:
    return __get_lat_lon(Image.open(filepath)._getexif())
  except:
    print("Unable to open image file " + filepath)
    return None
   

@retry(tries=5, delay=1, backoff=2)
def __get_attachment(sf, url, filepath):
  """Download file from SF with the specified URL, to the speficied path."""
  if not url.startswith("http"):
    url = sf.base_url + url
  attach_id = urllib.parse.parse_qs(
      urllib.parse.urlparse(url).query).get("file")[0]
  url = "{}sobjects/Attachment/{}/body".format(sf.base_url, attach_id)
  result = sf.session.get(url, headers=sf.headers, stream=True, timeout=5)
  with open(filepath, "wb") as o:
    for chunk in result.iter_content(SF_ATTACH_BUFFER):
      o.write(chunk)


def get_coords_for_single_survey(sf, outdir, survey):
  survey_id = survey["Id"]
  survey_id_to_data = {survey_id: {}}
  for image_type, image_field in IMAGE_FIELDS.items():
    image_url = survey[image_field]
    if not image_url:
      continue
    filename = "{}_{}.jpg".format(survey_id, image_type)
    filepath = os.path.join(outdir, filename)
    if os.path.exists(filepath):
      print("Skipping extant file for Id={}, field={}".format(
          survey_id, image_type))
    else:
      print("Downloading image for Id {} at URL {}".format(
          survey_id, image_url))
      try:
        __get_attachment(sf, image_url, filepath)
      except:
        print("Unable to download file for Id={}, field={}".format(
            survey_id, image_type))

    coords = __get_coords_from_file(filepath)
    if not coords:
      continue
    data = dict(zip(COORDS_FIELDS[image_type], coords))
    survey_id_to_data[survey_id].update(data)
  return survey_id_to_data


def get_coords_for_survey_images(sf, outdir, limit, pool_size):
  """Return a map from survey ID to a map ready to use in sf.update()."""
  limit_clause = "LIMIT {}".format(limit) if limit else ""

  has_image_string = " OR ".join(
      [f + " != null" for f in IMAGE_FIELDS.values()])
  all_coords_fields = [
      field for fields in COORDS_FIELDS.values() for field in fields
  ]
  has_any_coords_string = " AND ".join(
      [f + " = null" for f in all_coords_fields])
  # A clause like
  #   WHERE (Image_House__c != null OR Image_Token__c != null)
  #   AND (Image_House_GPS_Coordinates__Latitude__s = null
  #     AND Image_House_GPS_Coordinates__Longitude__s = null)
  where_clause = "WHERE ({}) AND ({})".format(has_image_string,
                                              has_any_coords_string)

  image_fields = ",".join(IMAGE_FIELDS.values())
  surveys = sf.query_all("SELECT Id, {} FROM Survey_Attempt__c {} {}".format(
      image_fields, where_clause, limit_clause))
  print("Got {} surveys to update".format(len(surveys["records"])))
  survey_id_to_data = {}
  with Pool(pool_size) as p:
    fn_with_sf = partial(get_coords_for_single_survey, sf, outdir)
    list_of_results = p.map(fn_with_sf, surveys["records"])
    # Flatten list.
    return {k: v for d in list_of_results for k, v in d.items()}


def write_coords_to_salesforce(sf, survey_id_to_data):
  """Write the data to SF using the bulk API."""
  update_to_send = []
  for survey_id, data in survey_id_to_data.items():
    if not data:
      continue  # Skip empty updates.
    update_dict = data.copy()
    update_dict["Id"] = survey_id
    update_to_send.append(update_dict)

  print("sending batch update: ", update_to_send)
  sf.bulk.Survey_Attempt__c.update(update_to_send)


if __name__ == "__main__":
  args = __get_args()

  os.makedirs(args.outdir, exist_ok=True)

  sf = Salesforce(
      username=USERNAME, password=PASSWORD, security_token=SECURITY_TOKEN)

  survey_id_to_data = get_coords_for_survey_images(sf, args.outdir, args.limit,
                                                   args.pool_size)
  write_coords_to_salesforce(sf, survey_id_to_data)

  shutil.rmtree(args.outdir)
