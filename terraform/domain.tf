variable "domain" {
  description = "domain"
}

// Set up a DNS zone for our domain.
resource "google_dns_managed_zone" "root" {
  name     = "root"
  dns_name = "${var.domain}."
}

// The domain is manually purchased, so we run this command to point it to our DNS zone.
/*
resource "null_resource" "dnsconfigure" {
  provisioner "local-exec" {
    command = <<-EOT
        gcloud beta domains registrations configure dns ${var.domain} --cloud-dns-zone=root
        EOT
  }

  depends_on = [
    google_project_service.all,
    google_dns_managed_zone.root
  ]
}
*/

// Create a certificate for the domain.
resource "google_compute_managed_ssl_certificate" "root" {
  name        = "root"
  description = "Cert for ${var.domain}."

  managed {
    domains = ["${var.domain}."]
  }

  lifecycle {
    create_before_destroy = true
  }
}
