terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.74.0"
    }
  }

  backend "gcs" {
    bucket = "quic-video-tfstate"
    prefix = "terraform/state"
  }

  required_version = ">= 0.14"
}

provider "google" {
  project = var.project
  region  = var.region
  zone    = var.zone
}

variable "gcp_service_list" {
  description = "The list of apis necessary for the project"
  type        = list(string)
  default = [
    "domains.googleapis.com",
    "storage.googleapis.com",
    "compute.googleapis.com",
    "dns.googleapis.com",
    "appengine.googleapis.com",
    "container.googleapis.com",
    "iamcredentials.googleapis.com"
  ]
}

resource "google_project_service" "all" {
  for_each                   = toset(var.gcp_service_list)
  service                    = each.key
  disable_dependent_services = false
  disable_on_destroy         = false
}
