# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'SODAS+ DIS'
copyright = '2022, KAIST NCL'
author = 'KAIST NCL'
release = '3.0.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration


extensions = ['sphinx_rtd_theme', 'sphinx_js', 'sphinx.ext.autodoc', 'myst_parser']
source_suffix = {
    '.rst': 'restructuredtext',
    '.txt': 'markdown',
    '.md': 'markdown',
}
primary_domain = 'js'
js_source_path = '../../'
jsdoc_config_path = '../../jsdoc.json'

templates_path = ['_templates']
exclude_patterns = []

language = 'ko'

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

import sphinx_rtd_theme
html_theme = 'sphinx_rtd_theme'  # in conf.py file
html_theme_path = [sphinx_rtd_theme.get_html_theme_path()]
html_static_path = ['_static']
