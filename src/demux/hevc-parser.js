/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import ExpGolomb from './exp-golomb.js';

class HevcParser {
        
    HEVC_NAL_UNIT_CODED_SLICE_BLA_W_LP = 16;
	HEVC_NAL_UNIT_CODED_SLICE_BLA_W_RADL = 17;
	HEVC_NAL_UNIT_CODED_SLICE_BLA_N_LP = 18;
	HEVC_NAL_UNIT_CODED_SLICE_IDR_W_RADL = 19;
	HEVC_NAL_UNIT_CODED_SLICE_IDR_N_LP = 20;
	HEVC_NAL_UNIT_CODED_SLICE_CRA = 21;

    HEVC_MAX_SUB_LAYERS = 7;
    
    FF_PROFILE_HEVC_MAIN =                        1;
    FF_PROFILE_HEVC_MAIN_10 =                     2;
    FF_PROFILE_HEVC_MAIN_STILL_PICTURE =          3;
    FF_PROFILE_HEVC_REXT =                        4;

    static _ebsp2rbsp(uint8array) {
        let src = uint8array;
        let src_length = src.byteLength;
        let dst = new Uint8Array(src_length);
        let dst_idx = 0;

        for (let i = 0; i < src_length; i++) {
            if (i >= 2) {
                // Unescape: Skip 0x03 after 00 00
                if (src[i] === 0x03 && src[i - 1] === 0x00 && src[i - 2] === 0x00) {
                    continue;
                }
            }
            dst[dst_idx] = src[i];
            dst_idx++;
        }

        return new Uint8Array(dst.buffer, 0, dst_idx);
    }

    static parseSPS(uint8array) {
        let rbsp = HevcParser._ebsp2rbsp(uint8array);
        let gb = new ExpGolomb(rbsp);

        gb.readByte();
        let profile_idc = gb.readByte();  // profile_idc
        gb.readByte();  // constraint_set_flags[5] + reserved_zero[3]
        let level_idc = gb.readByte();  // level_idc
        gb.readUEG();  // seq_parameter_set_id

        let profile_string = HevcParser.getProfileString(profile_idc);
        let level_string = HevcParser.getLevelString(level_idc);
        let chroma_format_idc = 1;
        let chroma_format = 420;
        let chroma_format_table = [0, 420, 422, 444];
        let bit_depth = 8;

        if (profile_idc === 100 || profile_idc === 110 || profile_idc === 122 ||
            profile_idc === 244 || profile_idc === 44 || profile_idc === 83 ||
            profile_idc === 86 || profile_idc === 118 || profile_idc === 128 ||
            profile_idc === 138 || profile_idc === 144) {

            chroma_format_idc = gb.readUEG();
            if (chroma_format_idc === 3) {
                gb.readBits(1);  // separate_colour_plane_flag
            }
            if (chroma_format_idc <= 3) {
                chroma_format = chroma_format_table[chroma_format_idc];
            }

            bit_depth = gb.readUEG() + 8;  // bit_depth_luma_minus8
            gb.readUEG();  // bit_depth_chroma_minus8
            gb.readBits(1);  // qpprime_y_zero_transform_bypass_flag
            if (gb.readBool()) {  // seq_scaling_matrix_present_flag
                let scaling_list_count = (chroma_format_idc !== 3) ? 8 : 12;
                for (let i = 0; i < scaling_list_count; i++) {
                    if (gb.readBool()) {  // seq_scaling_list_present_flag
                        if (i < 6) {
                            SPSParser._skipScalingList(gb, 16);
                        } else {
                            SPSParser._skipScalingList(gb, 64);
                        }
                    }
                }
            }
        }
        gb.readUEG();  // log2_max_frame_num_minus4
        let pic_order_cnt_type = gb.readUEG();
        if (pic_order_cnt_type === 0) {
            gb.readUEG();  // log2_max_pic_order_cnt_lsb_minus_4
        } else if (pic_order_cnt_type === 1) {
            gb.readBits(1);  // delta_pic_order_always_zero_flag
            gb.readSEG();  // offset_for_non_ref_pic
            gb.readSEG();  // offset_for_top_to_bottom_field
            let num_ref_frames_in_pic_order_cnt_cycle = gb.readUEG();
            for (let i = 0; i < num_ref_frames_in_pic_order_cnt_cycle; i++) {
                gb.readSEG();  // offset_for_ref_frame
            }
        }
        let ref_frames = gb.readUEG();  // max_num_ref_frames
        gb.readBits(1);  // gaps_in_frame_num_value_allowed_flag

        let pic_width_in_mbs_minus1 = gb.readUEG();
        let pic_height_in_map_units_minus1 = gb.readUEG();

        let frame_mbs_only_flag = gb.readBits(1);
        if (frame_mbs_only_flag === 0) {
            gb.readBits(1);  // mb_adaptive_frame_field_flag
        }
        gb.readBits(1);  // direct_8x8_inference_flag

        let frame_crop_left_offset = 0;
        let frame_crop_right_offset = 0;
        let frame_crop_top_offset = 0;
        let frame_crop_bottom_offset = 0;

        let frame_cropping_flag = gb.readBool();
        if (frame_cropping_flag) {
            frame_crop_left_offset = gb.readUEG();
            frame_crop_right_offset = gb.readUEG();
            frame_crop_top_offset = gb.readUEG();
            frame_crop_bottom_offset = gb.readUEG();
        }

        let sar_width = 1, sar_height = 1;
        let fps = 0, fps_fixed = true, fps_num = 0, fps_den = 0;

        let vui_parameters_present_flag = gb.readBool();
        if (vui_parameters_present_flag) {
            if (gb.readBool()) {  // aspect_ratio_info_present_flag
                let aspect_ratio_idc = gb.readByte();
                let sar_w_table = [1, 12, 10, 16, 40, 24, 20, 32, 80, 18, 15, 64, 160, 4, 3, 2];
                let sar_h_table = [1, 11, 11, 11, 33, 11, 11, 11, 33, 11, 11, 33,  99, 3, 2, 1];

                if (aspect_ratio_idc > 0 && aspect_ratio_idc < 16) {
                    sar_width = sar_w_table[aspect_ratio_idc - 1];
                    sar_height = sar_h_table[aspect_ratio_idc - 1];
                } else if (aspect_ratio_idc === 255) {
                    sar_width = gb.readByte() << 8 | gb.readByte();
                    sar_height = gb.readByte() << 8 | gb.readByte();
                }
            }

            if (gb.readBool()) {  // overscan_info_present_flag
                gb.readBool();  // overscan_appropriate_flag
            }
            if (gb.readBool()) {  // video_signal_type_present_flag
                gb.readBits(4);  // video_format & video_full_range_flag
                if (gb.readBool()) {  // colour_description_present_flag
                    gb.readBits(24);  // colour_primaries & transfer_characteristics & matrix_coefficients
                }
            }
            if (gb.readBool()) {  // chroma_loc_info_present_flag
                gb.readUEG();  // chroma_sample_loc_type_top_field
                gb.readUEG();  // chroma_sample_loc_type_bottom_field
            }
            if (gb.readBool()) {  // timing_info_present_flag
                let num_units_in_tick = gb.readBits(32);
                let time_scale = gb.readBits(32);
                fps_fixed = gb.readBool();  // fixed_frame_rate_flag

                fps_num = time_scale;
                fps_den = num_units_in_tick * 2;
                fps = fps_num / fps_den;
            }
        }

        let sarScale = 1;
        if (sar_width !== 1 || sar_height !== 1) {
            sarScale = sar_width / sar_height;
        }

        let crop_unit_x = 0, crop_unit_y = 0;
        if (chroma_format_idc === 0) {
            crop_unit_x = 1;
            crop_unit_y = 2 - frame_mbs_only_flag;
        } else {
            let sub_wc = (chroma_format_idc === 3) ? 1 : 2;
            let sub_hc = (chroma_format_idc === 1) ? 2 : 1;
            crop_unit_x = sub_wc;
            crop_unit_y = sub_hc * (2 - frame_mbs_only_flag);
        }

        let codec_width = (pic_width_in_mbs_minus1 + 1) * 16;
        let codec_height = (2 - frame_mbs_only_flag) * ((pic_height_in_map_units_minus1 + 1) * 16);

        codec_width -= (frame_crop_left_offset + frame_crop_right_offset) * crop_unit_x;
        codec_height -= (frame_crop_top_offset + frame_crop_bottom_offset) * crop_unit_y;

        let present_width = Math.ceil(codec_width * sarScale);

        gb.destroy();
        gb = null;

        return {
            profile_string: profile_string,  // baseline, high, high10, ...
            level_string: level_string,  // 3, 3.1, 4, 4.1, 5, 5.1, ...
            bit_depth: bit_depth,  // 8bit, 10bit, ...
            ref_frames: ref_frames,
            chroma_format: chroma_format,  // 4:2:0, 4:2:2, ...
            chroma_format_string: SPSParser.getChromaFormatString(chroma_format),

            frame_rate: {
                fixed: fps_fixed,
                fps: fps,
                fps_den: fps_den,
                fps_num: fps_num
            },

            sar_ratio: {
                width: sar_width,
                height: sar_height
            },

            codec_size: {
                width: codec_width,
                height: codec_height
            },

            present_size: {
                width: present_width,
                height: codec_height
            }
        };
    }
    
    static decode_profile_tier_level(gb, ptl) {
        //
        if (gb.getBitsLeft() < 2+1+5 + 32 + 4 + 43 + 1) {
            return -1;
        }

        ptl.profile_space = gb.readBits(2);
        ptl.tier_flag     = gb.readBits(1);
        ptl.profile_idc   = gb.readBits(5);
        //
        if(profile_idc === FF_PROFILE_HEVC_MAIN) {
            Log.v(this.TAG, 'Main profile bitstream');
        } else if(profile_idc === FF_PROFILE_HEVC_MAIN_10) {
            Log.v(this.TAG, 'Main 10 profile bitstream');
        } else if(profile_idc === FF_PROFILE_HEVC_MAIN_STILL_PICTURE) {
            Log.v(this.TAG, 'Main Still Picture profile bitstream');
        } else if(profile_idc === FF_PROFILE_HEVC_REXT) {
            Log.v(this.TAG, 'Range Extension profile bitstream');
        } else {
            Log.v(this.TAG, 'Unknown HEVC profile: ${profile_idc}', );
        }
        //
        for (i = 0; i < 32; i++) {
            ptl.profile_compatibility_flag[i] = gb.readBits(1);
    
            if (ptl.profile_idc === 0 && i > 0 && ptl.profile_compatibility_flag[i]) {
                ptl.profile_idc = i;
            }
        }
        //
        ptl.progressive_source_flag    = gb.readBits(1);
        ptl.interlaced_source_flag     = gb.readBits(1);
        ptl.non_packed_constraint_flag = gb.readBits(1);
        ptl.frame_only_constraint_flag = gb.readBits(1);
        //
        switch(profile_idc) {
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10: {
            if(!ptl.profile_compatibility_flag[profile_idc]) {
                break;
            }
            ptl.max_12bit_constraint_flag        = gb.readBits(1);
            ptl.max_10bit_constraint_flag        = gb.readBits(1);
            ptl.max_8bit_constraint_flag         = gb.readBits(1);
            ptl.max_422chroma_constraint_flag    = gb.readBits(1);
            ptl.max_420chroma_constraint_flag    = gb.readBits(1);
            ptl.max_monochrome_constraint_flag   = gb.readBits(1);
            ptl.intra_constraint_flag            = gb.readBits(1);
            ptl.one_picture_only_constraint_flag = gb.readBits(1);
            ptl.lower_bit_rate_constraint_flag   = gb.readBits(1);
            //
            if(profile_idc === 5 || profile_idc === 9 || profile_idc === 10) {
                ptl.max_14bit_constraint_flag = gb.readBits(1);
                gb.readBits(32); // XXX_reserved_zero_33bits[0..32]
                gb.readBits(1);
            } else {
                gb.readBits(32); // XXX_reserved_zero_34bits[0..33]
                gb.readBits(2); // XXX_reserved_zero_34bits[0..33]
            }
            break;
        }
        case 2: {
            if(!ptl.profile_compatibility_flag[ptl.profile_idc]) {
                break;
            }
            //
            gb.readBits(7);
            ptl.one_picture_only_constraint_flag = gb.readBits(1);
            gb.readBits(1); // XXX_reserved_zero_35bits[0..34]
            gb.readBits(35); // XXX_reserved_zero_35bits[0..34]
            break;
        }
        default: {
            gb.readBits(32); // XXX_reserved_zero_43bits[0..42]
            gb.readBits(11); // XXX_reserved_zero_43bits[0..42]
        }
        }
        //
        if(ptl.profile_idc === 1 || ptl.profile_idc === 2 || ptl.profile_idc === 3 ||
            ptl.profile_idc === 4 || ptl.profile_idc === 5 || ptl.profile_idc === 9) {
            //
            if(ptl.profile_compatibility_flag[profile_idc]) {
                ptl.inbld_flag = gb.readBits(1);
            } else {
                gb.readBits(1); // // skip 1bit
            }
        } else {
            gb.readBits(1); // skip 1bit
        }

        return 0;
    }

    static parse_ptl(gb, ptl, max_num_sub_layers) {
        var i;
        if (decode_profile_tier_level(gb) < 0 ||
            gb.getBitsLeft() < 8 + (8*2 * (max_num_sub_layers - 1 > 0))) {
            Log.e(this.TAG,  'PTL information too short');
            return -1;
        }

        ptl.general_ptl.level_idc = gb.readBits(8);
        //
        for (i = 0; i < max_num_sub_layers - 1; i++) {
            ptl.sub_layer_profile_present_flag[i] = gb.readBits(1);
            ptl.sub_layer_level_present_flag[i]   = gb.readBits(1);
        }
        //
        if (max_num_sub_layers - 1> 0) {
            for (i = max_num_sub_layers - 1; i < 8; i++) {
                // skip_bits(gb, 2); // reserved_zero_2bits[i]
                gb.readBits(2); // reserved_zero_2bits[i]
            }
        }
        //
        for (i = 0; i < max_num_sub_layers - 1; i++) {
            if (ptl.sub_layer_profile_present_flag[i] &&
                decode_profile_tier_level(gb, ptl.sub_layer_ptl[i]) ) {
                //
                Log.e(this.TAG, "PTL information for sublayer ${i} too short.");
                return -1;
            }
            if (ptl.sub_layer_level_present_flag[i]) {
                if (gb.getBitsLeft() < 8) {
                    Log.e(this.TAG, "Not enough data for sublayer ${i} level_idc");
                    return -1;
                } else {
                    ptl.sub_layer_ptl[i].level_idc = gb.readBits(8);
                }
            }
        }
        return 0;
    }

    static decode_sublayer_hrd(gb, nb_cpb, subpic_params_present) {
        var i;

        for (i = 0; i < nb_cpb; i++) {
            gb.readUEG(); // get_ue_golomb_long(gb); // bit_rate_value_minus1
            gb.readUEG(); // get_ue_golomb_long(gb); // cpb_size_value_minus1

            if (subpic_params_present) {
                gb.readUEG(); // get_ue_golomb_long(gb); // cpb_size_du_value_minus1
                gb.readUEG(); // get_ue_golomb_long(gb); // bit_rate_du_value_minus1
            }
            gb.skipBits(1); // skip_bits1(gb); // cbr_flag
        }
    }

    static decode_hrd(gb, common_inf_present, vps_max_sub_layers) {
        //
        var nal_params_present = 0, vcl_params_present = 0;
        var subpic_params_present = 0;
        var i;

        if (common_inf_present) {
            nal_params_present = gb.readBits(1); //get_bits1(gb);
            vcl_params_present = gb.readBits(1); // get_bits1(gb);

            if (nal_params_present || vcl_params_present) {
                subpic_params_present = gb.readBits(1); //  get_bits1(gb);

                if (subpic_params_present) {
                    gb.skipBits(8); // tick_divisor_minus2
                    gb.skipBits(5); // du_cpb_removal_delay_increment_length_minus1
                    gb.skipBits(1); // sub_pic_cpb_params_in_pic_timing_sei_flag
                    gb.skipBits(5); // dpb_output_delay_du_length_minus1
                }

                gb.skipBits(4); // bit_rate_scale
                gb.skipBits(4); // cpb_size_scale

                if (subpic_params_present) {
                    gb.skipBits(4);  // cpb_size_du_scale
                }

                gb.skipBits(5); // initial_cpb_removal_delay_length_minus1
                gb.skipBits(5); // au_cpb_removal_delay_length_minus1
                gb.skipBits(5); // dpb_output_delay_length_minus1
            }
        }

        for (i = 0; i < max_sublayers; i++) {
            var low_delay = 0;
            var nb_cpb = 1;
            var fixed_rate = gb.readBits(1); //get_bits1(gb);

            if (!fixed_rate) {
                fixed_rate = gb.readBits(1); // get_bits1(gb);
            }

            if (fixed_rate) {
                gb.readUEG(); // get_ue_golomb_long(gb);  // elemental_duration_in_tc_minus1
            } else {
                low_delay = gb.readBits(1); //get_bits1(gb);
            }

            if (!low_delay) {
                nb_cpb = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
                if (nb_cpb < 1 || nb_cpb > 32) {
                    Log.e(this.TAG, "nb_cpb ${nb_cpb} invalid\n");
                    return -1;// AVERROR_INVALIDDATA;
                }
            }

            if (nal_params_present) {
                decode_sublayer_hrd(gb, nb_cpb, subpic_params_present);
            }

            if (vcl_params_present) {
                decode_sublayer_hrd(gb, nb_cpb, subpic_params_present);
            }
        }
        return 0;
    }

    static parseVPS(uint8array, vps) {
        let rbsp = HevcParser._ebsp2rbsp(uint8array);
        let gb = new ExpGolomb(rbsp);

        vps.vps_video_parameter_set_id = gb.readBits(4); // u(4)
        vps_id = vps.vps_video_parameter_set_id;
        vps.vps_base_layer_internal_flag = gb.readBits(1); // u(1)
        vps.vps_base_layer_available_flag = gb.readBits(1); // u(1)
        //
        vps.vps_max_layers_minus1 = gb.readBits(6) + 1; // u(6)
        vps.vps_max_sub_layers_minus1 = gb.readBits(3) + 1; // u(3)
        vps.vps_temporal_id_nesting_flag = gb.readBits(1); // u(1)

        let vps_reserved_0xffff_16bits = gb.readBits(16); // u(16)
        if(vps_reserved_0xffff_16bits !== 0xffff) {
            // error: "vps_reserved_ffff_16bits is not 0xffff\n"
        }
        // 
        if( vps.vps_max_sub_layers > HEVC_MAX_SUB_LAYERS) {
            // error: vps_max_sub_layers out of range
        }
        //
        parse_ptl(gb, vps.ptl, vps.vps_max_sub_layers);
        //
        vps_sub_layer_ordering_info_present_flag = gb.readBits(1);
        // 
        i = vps_sub_layer_ordering_info_present_flag ? 0 : vps_max_sub_layers - 1;

        for (; i < vps.vps_max_sub_layers; i++) {
            vps.vps_max_dec_pic_buffering[i] = gb.readUEG() + 1;    // get_ue_golomb_long(gb) + 1;
            vps.vps_num_reorder_pics[i]      = gb.readUEG();        // get_ue_golomb_long(gb);
            vps.vps_max_latency_increase[i]  = gb.readUEG() - 1;    // get_ue_golomb_long(gb) - 1;
    
            if (vps.vps_max_dec_pic_buffering[i] > HEVC_MAX_DPB_SIZE || !vps.vps_max_dec_pic_buffering[i]) {
                Log.e(this.TAG, "vps_max_dec_pic_buffering_minus1 out of range: ${vps.vps_max_dec_pic_buffering[i] - 1}");
                // goto err;
            }
            if (vps.vps_num_reorder_pics[i] > vps.vps_max_dec_pic_buffering[i] - 1) {
                Log.e(this.TAG, "vps_max_num_reorder_pics out of range: ${vps.vps_num_reorder_pics[i]}");
                // if (avctx->err_recognition & AV_EF_EXPLODE)
                //     goto err;
            }
        }
    
        vps.vps_max_layer_id   = gb.readBits(6);
        vps.vps_num_layer_sets = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
        //

        if (vps.vps_num_layer_sets < 1 || vps.vps_num_layer_sets > 1024 ||
            (vps.vps_num_layer_sets - 1) * (vps.vps_max_layer_id + 1) > gb.getBitsLeft()  ) { 
                // get_bits_left(gb)
                Log.e(this.TAG, "too many layer_id_included_flags");
            // goto err;
        }
    
        for (i = 1; i < vps.vps_num_layer_sets; i++) {
            for (j = 0; j <= vps.vps_max_layer_id; j++) {
                // skip_bits(gb, 1);  // layer_id_included_flag[i][j]
                gb.readBits(1);
            }
        }
    
        vps.vps_timing_info_present_flag = gb.readBits(1); // get_bits1(gb);
        if (vps.vps_timing_info_present_flag) {
            vps.vps_num_units_in_tick               = gb.readBits(32); // get_bits_long(gb, 32);
            vps.vps_time_scale                      = gb.readBits(32); // get_bits_long(gb, 32);
            vps.vps_poc_proportional_to_timing_flag = gb.readBits(1); // get_bits1(gb);
            if (vps.vps_poc_proportional_to_timing_flag) {
                vps.vps_num_ticks_poc_diff_one = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
            }
            vps.vps_num_hrd_parameters = gb.readUEG();// get_ue_golomb_long(gb);
            if (vps.vps_num_hrd_parameters > vps.vps_num_layer_sets) {
                Log.e(this.TAG, "vps_num_hrd_parameters ${vps.vps_num_hrd_parameters} is invalid.");
                // goto err;
            }

            for (i = 0; i < vps.vps_num_hrd_parameters; i++) {
                var common_inf_present = 1;
    
                gb.readUEG(); // get_ue_golomb_long(gb); // hrd_layer_set_idx
                if (i) {
                    common_inf_present = gb.readBits(1); // get_bits1(gb);
                }
                decode_hrd(gb, common_inf_present, vps.vps_max_sub_layers);
            }
        }
        gb.readBits(1); // get_bits1(gb); /* vps_extension_flag */
    
        if (gb.getBitsLeft() < 0) {
            Log.e(this.TAG, "Overread VPS by ${- gb.getBitsLeft()} bits.");
            if (ps.vps_list[vps_id]) {
                // goto err;
            }
        }
        /*
        if (ps.vps_list[vps_id] &&
            !memcmp(ps->vps_list[vps_id]->data, vps_buf->data, vps_buf->size)) {
            av_buffer_unref(&vps_buf);
        } else {
            remove_vps(ps, vps_id);
            ps->vps_list[vps_id] = vps_buf;
        }
        */
        return 0;
    }

    static parsePPS(uint8array, pps) {

    }


    static _skipScalingList(gb, count) {
        let last_scale = 8, next_scale = 8;
        let delta_scale = 0;
        for (let i = 0; i < count; i++) {
            if (next_scale !== 0) {
                delta_scale = gb.readSEG();
                next_scale = (last_scale + delta_scale + 256) % 256;
            }
            last_scale = (next_scale === 0) ? last_scale : next_scale;
        }
    }

    static getProfileString(profile_idc) {
        switch (profile_idc) {
            case 66:
                return 'Baseline';
            case 77:
                return 'Main';
            case 88:
                return 'Extended';
            case 100:
                return 'High';
            case 110:
                return 'High10';
            case 122:
                return 'High422';
            case 244:
                return 'High444';
            default:
                return 'Unknown';
        }
    }

    static getLevelString(level_idc) {
        return (level_idc / 10).toFixed(1);
    }

    static getChromaFormatString(chroma) {
        switch (chroma) {
            case 420:
                return '4:2:0';
            case 422:
                return '4:2:2';
            case 444:
                return '4:4:4';
            default:
                return 'Unknown';
        }
    }

    static isKeyFrame(nal_type) {
        switch (nal_type) {
        case HEVC_NAL_UNIT_CODED_SLICE_BLA_W_LP:
        case HEVC_NAL_UNIT_CODED_SLICE_BLA_W_RADL:
        case HEVC_NAL_UNIT_CODED_SLICE_BLA_N_LP:
        case HEVC_NAL_UNIT_CODED_SLICE_IDR_W_RADL:
        case HEVC_NAL_UNIT_CODED_SLICE_IDR_N_LP:
        case HEVC_NAL_UNIT_CODED_SLICE_CRA:
            return true;
        }

        return false;
    }
    

}

export default SPSParser;