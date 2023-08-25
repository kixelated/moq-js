// https://cloud.google.com/shell/docs/cloud-shell-tutorials/deploystack/static-hosting-with-domain

// Create a bucket to hold the static website.
resource "google_storage_bucket" "web" {
  name          = "${var.project}-web"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  cors {
    origin          = [var.domain]
    method          = ["GET"]
    max_age_seconds = 3600
  }
}

// Create an IP address for the load balancer.
resource "google_compute_global_address" "web" {
  name       = "web"
  ip_version = "IPV4"
}

resource "google_storage_bucket_iam_binding" "web" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectViewer"
  members = [
    "allUsers",
  ]
  depends_on = [google_storage_bucket.web]
}

resource "google_compute_backend_bucket" "web" {
  name        = "web-be"
  bucket_name = google_storage_bucket.web.name
  depends_on  = [google_storage_bucket.web]
}

resource "google_compute_url_map" "web" {
  name            = "web-lb"
  depends_on      = [google_compute_backend_bucket.web]
  default_service = google_compute_backend_bucket.web.id

  header_action {
    response_headers_to_add {
      header_name  = "Cross-Origin-Opener-Policy"
      header_value = "same-origin"
      replace      = false
    }

    response_headers_to_add {
      header_name  = "Cross-Origin-Embedder-Policy"
      header_value = "require-corp"
      replace      = false
    }
  }
}

resource "google_compute_target_https_proxy" "web" {
  name             = "web"
  url_map          = google_compute_url_map.web.id
  ssl_certificates = [google_compute_managed_ssl_certificate.root.id]
  depends_on       = [google_compute_url_map.web, google_compute_managed_ssl_certificate.root]
}

resource "google_compute_global_forwarding_rule" "web" {
  name                  = "web"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.web.id
  ip_address            = google_compute_global_address.web.id
  depends_on            = [google_compute_target_https_proxy.web]
}

resource "google_compute_url_map" "web-http" {
  name = "web-http"

  default_url_redirect {
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT" // 301 redirect
    strip_query            = false
    https_redirect         = true // Redirect to HTTPS
  }
}

resource "google_compute_target_http_proxy" "web-http" {
  name    = "web-http"
  url_map = google_compute_url_map.web-http.self_link
}

resource "google_compute_global_forwarding_rule" "web-http" {
  name       = "web-http"
  target     = google_compute_target_http_proxy.web-http.self_link
  ip_address = google_compute_global_address.web.id
  port_range = "80"
}

// Create a DNS record that points to the web load balancer.
resource "google_dns_record_set" "web" {
  managed_zone = google_dns_managed_zone.root.name
  name         = "${var.domain}."
  type         = "A"
  ttl          = 60

  rrdatas    = [google_compute_global_address.web.address]
  depends_on = [google_compute_global_address.web]
}

// Create a service account that has deploy permission.
resource "google_service_account" "web_deploy" {
  account_id = "web-deploy"
}

resource "google_storage_bucket_iam_member" "web_deploy" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web_deploy.email}"
}

output "web_deploy_account" {
  value = google_service_account.web_deploy.email
}

output "web_deploy_bucket" {
  value = google_storage_bucket.web.name
}
