<?php
/**
 * The Fernway form as an Elementor widget: the same form, drawn by the same code as the block.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Elementor_Widget extends \Elementor\Widget_Base {

	public function get_name() {
		return 'fernway_form';
	}

	public function get_title() {
		return __( 'Fernway form', 'fernway' );
	}

	public function get_icon() {
		return 'eicon-form-horizontal';
	}

	public function get_categories() {
		return array( 'general' );
	}

	public function get_keywords() {
		return array( 'fernway', 'form', 'lead', 'booking', 'gohighlevel', 'crm' );
	}

	public function get_style_depends() {
		return array( 'fernway-form' );
	}

	public function get_script_depends() {
		return array( 'fernway-form-view' );
	}

	protected function register_controls() {
		$this->start_controls_section( 'form', array( 'label' => __( 'Form', 'fernway' ) ) );
		$this->add_control( 'route', array( 'label' => __( 'Route', 'fernway' ), 'type' => \Elementor\Controls_Manager::TEXT, 'description' => __( 'Where the leads go in GoHighLevel. Empty: the default from Settings, Fernway.', 'fernway' ) ) );
		$this->add_control(
			'fields',
			array(
				'label'    => __( 'Fields', 'fernway' ),
				'type'     => \Elementor\Controls_Manager::SELECT2,
				'multiple' => true,
				'default'  => array( 'name', 'email', 'phone', 'message' ),
				'options'  => array(
					'address' => __( 'Address', 'fernway' ),
					'name'    => __( 'Name', 'fernway' ),
					'phone'   => __( 'Phone', 'fernway' ),
					'email'   => __( 'Email', 'fernway' ),
					'company' => __( 'Company', 'fernway' ),
					'slot'    => __( 'Day and time (booking routes)', 'fernway' ),
					'message' => __( 'Message', 'fernway' ),
				),
			)
		);
		$this->add_control( 'variant', array( 'label' => __( 'Layout', 'fernway' ), 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'full', 'options' => array( 'full' => __( 'Full, with its title', 'fernway' ), 'compact' => __( 'Compact', 'fernway' ) ) ) );
		$this->add_control( 'title', array( 'label' => __( 'Title', 'fernway' ), 'type' => \Elementor\Controls_Manager::TEXT ) );
		$this->add_control( 'submit', array( 'label' => __( 'Button', 'fernway' ), 'type' => \Elementor\Controls_Manager::TEXT, 'placeholder' => __( 'Send', 'fernway' ) ) );
		$this->add_control( 'note', array( 'label' => __( 'Note beside the button', 'fernway' ), 'type' => \Elementor\Controls_Manager::TEXT ) );
		$this->end_controls_section();

		$this->start_controls_section( 'look', array( 'label' => __( 'Colours', 'fernway' ), 'tab' => \Elementor\Controls_Manager::TAB_STYLE ) );
		foreach ( array( 'surface' => __( 'Background', 'fernway' ), 'ink' => __( 'Text', 'fernway' ), 'accent' => __( 'Button', 'fernway' ), 'accent-ink' => __( 'Button text', 'fernway' ) ) as $var => $label ) {
			$this->add_control( 'c_' . str_replace( '-', '_', $var ), array( 'label' => $label, 'type' => \Elementor\Controls_Manager::COLOR, 'selectors' => array( '{{WRAPPER}} .fernway' => '--fw-' . $var . ': {{VALUE}};' ) ) );
		}
		$this->add_control( 'radius', array( 'label' => __( 'Corners', 'fernway' ), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array( 'px' => array( 'min' => 0, 'max' => 16 ) ), 'selectors' => array( '{{WRAPPER}} .fernway' => '--fw-radius: {{SIZE}}px;' ) ) );
		$this->end_controls_section();
	}

	protected function render() {
		$a = $this->get_settings_for_display();
		echo Form::html( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside.
			Form::settings(
				array(
					'route'       => $a['route'] ?? '',
					'fields'      => $a['fields'] ?? array(),
					'variant'     => $a['variant'] ?? 'full',
					'title'       => $a['title'] ?? '',
					'submitLabel' => $a['submit'] ?? '',
					'note'        => $a['note'] ?? '',
				)
			)
		);
	}
}
