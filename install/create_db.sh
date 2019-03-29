#!/bin/bash

sudo -u postgres \
	psql \
		-h /var/run/postgresql/ \
		-d name_of_database \
		-U name_of_user \
		< ./dec112-border.sql

