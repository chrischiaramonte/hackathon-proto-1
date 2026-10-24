"""TLS context shared by the download scripts.

The python.org builds of Python on macOS ship without CA certificates, and
signdata.cc.gatech.edu chains to an emSign root that certifi and the macOS
keychain reject. The system OpenSSL bundle (/etc/ssl/cert.pem) handles both.
Set SSL_CERT_FILE to use a different bundle.
"""

import os
import ssl
from pathlib import Path

_CAFILE = os.environ.get("SSL_CERT_FILE") or ("/etc/ssl/cert.pem" if Path("/etc/ssl/cert.pem").exists() else None)
SSL_CONTEXT = ssl.create_default_context(cafile=_CAFILE)
